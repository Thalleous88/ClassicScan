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
