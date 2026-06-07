from __future__ import annotations

from pathlib import Path

import pytest

ml_pipeline = pytest.importorskip("ml.pipeline")
ocr_from_scratch = pytest.importorskip("ml.ocr_from_scratch")

_BACKEND = Path(__file__).resolve().parents[1]
_CANDIDATE_IMAGES = [
    _BACKEND / "ml" / "test3.jpg",
    _BACKEND / "ml" / "test.jpg",
    _BACKEND / "ml" / "test2.jpg",
    _BACKEND / "ml" / "test4.jpeg",
]


def _pick_image() -> Path | None:
    for p in _CANDIDATE_IMAGES:
        if p.exists():
            return p
    return None


@pytest.mark.skipif(_pick_image() is None, reason="no dev image available")
def test_pipeline_result_records_engine_used():
    img = _pick_image()
    assert img is not None
    out = ml_pipeline.run_from_path(str(img), return_enhanced=True)
    assert type(out.ocr_engine_used) is str
    assert out.ocr_engine_used in ("pytesseract", "from_scratch")


def test_from_scratch_engine_runs_when_model_present():
    """Smoke test: render a synthetic page and OCR it with the from-scratch
    engine. If the model isn't trained yet, skip (CI may not have run training)."""
    if not ocr_from_scratch.has_model():
        pytest.skip("from_scratch model not trained in this environment")
    import cv2
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    text = "Hello World"
    canvas = Image.new("L", (640, 200), color=255)
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", size=44)
    except Exception:
        font = ImageFont.load_default()
    draw.text((40, 70), text, font=font, fill=0)
    arr = np.array(canvas, dtype=np.uint8)
    bgr = cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR)

    result = ml_pipeline.run_from_array(
        bgr,
        return_enhanced=False,
        ocr_engine="from_scratch",
    )
    assert result.ocr_engine_used == "from_scratch"
    assert isinstance(result.text, str)


def test_from_scratch_falls_back_when_model_missing(monkeypatch):
    """When the from-scratch model artifact is absent, the pipeline must
    transparently fall back to PyTesseract and record that fact."""
    img = _pick_image()
    if img is None:
        pytest.skip("no dev image available")
    monkeypatch.setattr(ocr_from_scratch, "has_model", lambda: False)
    result = ml_pipeline.run_from_path(
        str(img),
        return_enhanced=False,
        ocr_engine="from_scratch",
    )
    assert result.ocr_engine_used == "pytesseract"
