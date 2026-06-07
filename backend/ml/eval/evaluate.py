from __future__ import annotations

import sys
from pathlib import Path

import Levenshtein

ML_DIR = Path(__file__).resolve().parents[1]
ROOT = ML_DIR.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml import pipeline

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

def _run_track(name: str, files: list[str], engine: str) -> None:
    if not files:
        print(f"[{name}] no manifest entries")
        return
    print(f"\n=== {name.upper()} TRACK (engine={engine}) ===")
    rows = []
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
        try:
            r = pipeline.run_from_path(str(img), encode_crop=False, ocr_engine=engine)
        except Exception as e:
            print(f"  FAIL {fname}: {e}")
            continue
        actual_engine = r.ocr_engine_used
        cer = _cer(ref, r.text.strip())
        wer = _wer(ref, r.text.strip())
        rows.append((fname, r.mean_conf, cer, wer, actual_engine))
        print(f"  {fname:30s} engine={actual_engine:14s} conf={r.mean_conf:6.2f} cer={cer:.3f} wer={wer:.3f}")
    if rows:
        avg_conf = sum(r[1] for r in rows) / len(rows)
        avg_cer = sum(r[2] for r in rows) / len(rows)
        avg_wer = sum(r[3] for r in rows) / len(rows)
        print(f"  N={len(rows)}  avg_conf={avg_conf:.2f}  avg CER={avg_cer:.3f}  avg WER={avg_wer:.3f}")

def main() -> None:
    printed = _read_manifest("printed.txt")
    handwriting = _read_manifest("handwriting.txt")
    for engine in ("pytesseract", "from_scratch"):
        _run_track("printed", printed, engine)
        _run_track("handwriting", handwriting, engine)

if __name__ == "__main__":
    main()
