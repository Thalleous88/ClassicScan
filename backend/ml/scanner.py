from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml import pipeline, scanner_enhance

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?", default="test4.jpeg")
    ap.add_argument("--mode", choices=["auto", "printed", "handwriting"], default="auto")
    ap.add_argument("--enhance", choices=list(scanner_enhance.MODES), default="color")
    ap.add_argument("--quality", type=int, default=88)
    ap.add_argument("--no-ocr", action="store_true")
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--lang", default="eng")
    args = ap.parse_args()

    if args.debug:
        os.environ["OCR_DEBUG"] = "1"

    here = Path(__file__).resolve().parent
    img_path = here / args.path if not Path(args.path).is_absolute() else Path(args.path)
    if not img_path.exists():
        print(f"Image not found: {img_path}")
        return

    result = pipeline.run_from_path(
        str(img_path),
        mode=args.mode,
        lang=args.lang,
        enhance_mode=args.enhance,
        enhance_quality=args.quality,
        return_enhanced=True,
        skip_ocr=args.no_ocr,
    )
    print(f"document_detected={result.document_detected} score={result.detection_score:.3f}")
    print(f"pipeline_path={result.pipeline_path} handwriting_detected={result.handwriting_detected} "
          f"hw_conf={result.handwriting_confidence:.2f}")
    if not args.no_ocr:
        print(f"psm_used={result.psm_used} mean_conf={result.mean_conf:.2f} lang={result.language}")
    print(f"enhance_mode={result.enhance_mode_used} mime={result.enhanced_mime}")
    if result.confidence_warning:
        print(f"WARNING: {result.confidence_warning}")
    if not args.no_ocr:
        print("=" * 60)
        print(result.text)
        print("=" * 60)
        print("Alternatives:")
        for a in result.text_alternatives:
            snippet = (a.text[:80] + "...") if len(a.text) > 80 else a.text
            print(f"  psm={a.psm:2d} lang={a.lang:18s} kind={a.image_kind:18s} "
                  f"conf={a.mean_conf:6.2f} words={a.word_count:4d}  {snippet!r}")

    if result.crop_jpg:
        out = here / "scanner_out.jpg"
        out.write_bytes(result.crop_jpg)
        print(f"Saved warped crop to {out}")
    if result.enhanced_bytes:
        ext = ".png" if result.enhanced_mime == "image/png" else ".jpg"
        out = here / f"scanner_enhanced{ext}"
        out.write_bytes(result.enhanced_bytes)
        print(f"Saved enhanced output to {out}")

if __name__ == "__main__":
    main()
