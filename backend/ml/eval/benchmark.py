from __future__ import annotations

import statistics
import sys
import time
from pathlib import Path

import Levenshtein

ML_DIR = Path(__file__).resolve().parents[1]
ROOT = ML_DIR.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml import pipeline

WARMUP = 3
RUNS = 10

STAGES = ("detect_warp", "orient_deskew_dpi", "ocr_enhance", "ocr")


def _cer(ref: str, hyp: str) -> float:
    if not ref:
        return 1.0 if hyp else 0.0
    return Levenshtein.distance(ref, hyp) / len(ref)


def _wer(ref: str, hyp: str) -> float:
    ref_tokens = ref.split()
    hyp_tokens = hyp.split()
    if not ref_tokens:
        return 1.0 if hyp_tokens else 0.0
    return Levenshtein.distance(" ".join(ref_tokens), " ".join(hyp_tokens)) / len(
        " ".join(ref_tokens)
    )


def _read_manifest(name: str) -> list[str]:
    f = ML_DIR / "eval" / name
    if not f.exists():
        return []
    return [
        line.strip()
        for line in f.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]


def _ms(v: float) -> str:
    return f"{v:.1f}"


def _stats_label(values: list[float]) -> str:
    if len(values) < 2:
        return _ms(values[0]) if values else "N/A"
    avg = statistics.mean(values)
    sd = statistics.stdev(values) if len(values) > 1 else 0.0
    return f"{_ms(avg)} ±{_ms(sd)}"


def _run_track(
    name: str, files: list[str], engine: str
) -> None:
    if not files:
        print(f"[{name}] no manifest entries")
        return
    print(f"\n{'='*80}")
    print(f"  {name.upper()} TRACK  |  engine={engine}")
    print(f"{'='*80}")

    header = (
        f"  {'image':30s} {'total_ms':>18s}  "
        f"{'detect':>14s}  {'orient':>14s}  {'ocr_prep':>14s}  "
        f"{'ocr':>14s}  {'conf':>6s}  {'cer':>6s}  {'wer':>6s}"
    )
    print(header)
    print("  " + "-" * (len(header) - 2))

    rows: list[tuple[str, float, float, float, float]] = []

    for fname in files:
        img = ML_DIR / fname
        if not img.exists():
            print(f"  skip {fname} (missing)")
            continue
        gt_file = img.with_suffix(img.suffix + ".gt.txt")
        if not gt_file.exists():
            print(f"  skip {fname} (no {gt_file.name})")
            continue
        ref = gt_file.read_text(encoding="utf-8").strip()

        # warmup
        for _ in range(WARMUP):
            pipeline.run_from_path(str(img), encode_crop=False, ocr_engine=engine)

        all_totals: list[float] = []
        all_stage: dict[str, list[float]] = {s: [] for s in STAGES}
        all_confs: list[float] = []
        all_cers: list[float] = []
        all_wers: list[float] = []

        for _ in range(RUNS):
            t0 = time.perf_counter()
            r = pipeline.run_from_path(str(img), encode_crop=False, ocr_engine=engine)
            elapsed = (time.perf_counter() - t0) * 1000
            all_totals.append(elapsed)

            for s in STAGES:
                if s in r.timing_ms:
                    all_stage[s].append(r.timing_ms[s])

            all_confs.append(r.mean_conf)
            cer = _cer(ref, r.text.strip())
            wer = _wer(ref, r.text.strip())
            all_cers.append(cer)
            all_wers.append(wer)

        total_str = _stats_label(all_totals)
        detect_str = _stats_label(all_stage["detect_warp"]) if all_stage["detect_warp"] else "N/A"
        orient_str = _stats_label(all_stage["orient_deskew_dpi"]) if all_stage["orient_deskew_dpi"] else "N/A"
        ocrp_str = _stats_label(all_stage["ocr_enhance"]) if all_stage["ocr_enhance"] else "N/A"
        ocr_str = _stats_label(all_stage["ocr"]) if all_stage["ocr"] else "N/A"
        conf_avg = statistics.mean(all_confs)
        cer_avg = statistics.mean(all_cers)
        wer_avg = statistics.mean(all_wers)

        print(
            f"  {fname:30s} {total_str:>18s}  "
            f"{detect_str:>14s}  {orient_str:>14s}  {ocrp_str:>14s}  "
            f"{ocr_str:>14s}  {conf_avg:6.2f}  {cer_avg:.4f}  {wer_avg:.4f}"
        )

        rows.append((fname, conf_avg, cer_avg, wer_avg))

    if rows:
        avg_conf = statistics.mean(r[1] for r in rows)
        avg_cer = statistics.mean(r[2] for r in rows)
        avg_wer = statistics.mean(r[3] for r in rows)
        print(f"  {'-'*40}")
        print(f"  {'AVERAGE':30s} {'':>18s}  {'':>14s}  {'':>14s}  {'':>14s}  {'':>14s}  {avg_conf:6.2f}  {avg_cer:.4f}  {avg_wer:.4f}")


def main() -> None:
    printed = _read_manifest("printed.txt")
    handwriting = _read_manifest("handwriting.txt")
    for engine in ("pytesseract", "from_scratch"):
        _run_track("printed", printed, engine)
        _run_track("handwriting", handwriting, engine)


if __name__ == "__main__":
    main()
