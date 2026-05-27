from __future__ import annotations

from pathlib import Path

import pytest

ml_pipeline = pytest.importorskip("ml.pipeline")

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
def test_pipeline_result_has_native_python_types():
    img = _pick_image()
    assert img is not None
    result = ml_pipeline.run_from_path(str(img), return_enhanced=True)

    assert type(result.mean_conf) is float
    assert type(result.detection_score) is float
    assert type(result.handwriting_confidence) is float
    assert type(result.psm_used) is int
    assert type(result.document_detected) is bool
    assert type(result.handwriting_detected) is bool

    assert result.enhanced_bytes is None or isinstance(result.enhanced_bytes, bytes)
    assert result.crop_jpg is None or isinstance(result.crop_jpg, bytes)

    assert type(result.text) is str
    assert type(result.language) is str
    assert type(result.pipeline_path) is str
    assert type(result.enhance_mode_used) is str
    assert type(result.enhanced_mime) is str
    assert result.confidence_warning is None or type(result.confidence_warning) is str

    for w in result.words:
        assert type(w.text) is str
        assert type(w.conf) is float
        assert type(w.bbox) is tuple
        assert len(w.bbox) == 4
        assert all(type(v) is int for v in w.bbox)

    for a in result.text_alternatives:
        assert type(a.psm) is int
        assert type(a.mean_conf) is float
        assert type(a.word_count) is int
        assert type(a.text) is str
        assert type(a.lang) is str
        assert type(a.image_kind) is str

@pytest.mark.skipif(_pick_image() is None, reason="no dev image available")
def test_pipeline_result_to_dict_is_json_safe():
    import json

    img = _pick_image()
    assert img is not None
    result = ml_pipeline.run_from_path(str(img), return_enhanced=True)
    payload = result.to_dict()
    json.dumps(payload)

@pytest.mark.skipif(_pick_image() is None, reason="no dev image available")
def test_pipeline_respects_max_edge_cap():
    import cv2
    import numpy as np

    img = _pick_image()
    assert img is not None
    result = ml_pipeline.run_from_path(str(img), return_enhanced=True)
    if not result.enhanced_bytes:
        pytest.skip("no enhanced bytes returned")
    decoded = cv2.imdecode(np.frombuffer(result.enhanced_bytes, np.uint8), cv2.IMREAD_COLOR)
    assert decoded is not None
    h, w = decoded.shape[:2]
    cap = ml_pipeline.PIPELINE_MAX_EDGE
    assert max(h, w) <= cap + 2, f"long edge {max(h, w)} exceeds cap {cap}"


def test_decode_honours_exif_orientation():
    """A JPEG carrying EXIF orientation = 6 (rotate 90° CW for display) must
    come back from `_decode` already rotated, so its pixel grid matches what
    a phone, browser, or any EXIF-aware viewer would show. Without this fix,
    quad_override coordinates from the frontend land in the wrong coordinate
    space and the manual crop misaligns with the detected document.
    """
    from io import BytesIO

    from PIL import Image

    # Build a 200×100 landscape image; mark the top-LEFT corner with a
    # 16×16 green block so JPEG's 8×8 DCT compression doesn't smear the
    # signal. Under 90° CW, original (0, 0) maps to portrait (W-1, 0) =
    # top-right of the rotated image, where W is the rotated width
    # (=original height).
    src = Image.new("RGB", (200, 100), color=(255, 0, 0))
    for y in range(16):
        for x in range(16):
            src.putpixel((x, y), (0, 255, 0))

    exif = src.getexif()
    exif[0x0112] = 6  # Orientation: rotate 90° CW for display

    buf = BytesIO()
    src.save(buf, format="JPEG", exif=exif.tobytes(), quality=95)

    bgr = ml_pipeline._decode(buf.getvalue())

    # Pixels must be physically rotated to portrait 100×200.
    h, w = bgr.shape[:2]
    assert (w, h) == (100, 200), (
        f"expected 100×200 portrait after EXIF correction, got {w}×{h}"
    )

    # Original top-left becomes top-right of the rotated portrait image.
    # Sample a few pixels in from the corner to dodge any JPEG edge noise.
    px = bgr[4, w - 5]
    assert px[1] > 180 and px[0] < 80 and px[2] < 80, (
        "green marker did not land at top-right after EXIF rotation: "
        f"BGR={tuple(int(c) for c in px)}"
    )


def test_decode_passthrough_when_no_exif():
    """A JPEG without an orientation tag must come back at its native size."""
    from io import BytesIO

    from PIL import Image

    src = Image.new("RGB", (160, 90), color=(20, 40, 60))
    buf = BytesIO()
    src.save(buf, format="JPEG", quality=95)

    bgr = ml_pipeline._decode(buf.getvalue())
    h, w = bgr.shape[:2]
    assert (w, h) == (160, 90), f"expected 160×90, got {w}×{h}"
