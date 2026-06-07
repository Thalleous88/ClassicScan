from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np

from . import detector, enhancer, ocr, ocr_from_scratch, scanner_enhance

DEBUG_DIR = Path(__file__).resolve().parent / "debug"

PIPELINE_MAX_EDGE = 2200

OCR_ENGINES = ("pytesseract", "from_scratch")

@dataclass
class WordOut:
    text: str
    conf: float
    bbox: tuple[int, int, int, int]

    def __post_init__(self) -> None:
        self.text = str(self.text)
        self.conf = float(self.conf)
        self.bbox = tuple(int(v) for v in self.bbox)

@dataclass
class AlternativeOut:
    psm: int
    lang: str
    image_kind: str
    text: str
    mean_conf: float
    word_count: int

    def __post_init__(self) -> None:
        self.psm = int(self.psm)
        self.mean_conf = float(self.mean_conf)
        self.word_count = int(self.word_count)

@dataclass
class PipelineResult:
    text: str
    mean_conf: float
    language: str
    document_detected: bool
    detection_score: float
    psm_used: int
    confidence_warning: Optional[str]
    words: list[WordOut]
    text_alternatives: list[AlternativeOut] = field(default_factory=list)
    enhance_mode_used: str = "color"
    enhanced_mime: str = "image/jpeg"
    ocr_engine_used: str = "pytesseract"
    crop_jpg: Optional[bytes] = None
    enhanced_bytes: Optional[bytes] = None

    def __post_init__(self) -> None:
        self.mean_conf = float(self.mean_conf)
        self.detection_score = float(self.detection_score)
        self.psm_used = int(self.psm_used)
        self.document_detected = bool(self.document_detected)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d.pop("crop_jpg", None)
        d.pop("enhanced_bytes", None)
        return d

def _decode(image_bytes: bytes) -> np.ndarray:
    from io import BytesIO

    from PIL import Image, ImageOps

    try:
        with Image.open(BytesIO(image_bytes)) as im:
            im = ImageOps.exif_transpose(im)
            im = im.convert("RGB")
            arr = np.array(im)
    except Exception as e:
        raise ValueError("could not decode image") from e
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

def _debug_enabled() -> bool:
    return os.getenv("OCR_DEBUG", "").strip() in ("1", "true", "True", "yes")

def _new_debug_session() -> Optional[Path]:
    if not _debug_enabled():
        return None
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{int(time.time())}_{uuid.uuid4().hex[:6]}"
    sess = DEBUG_DIR / name
    sess.mkdir(parents=True, exist_ok=True)
    return sess

def _dump(sess: Optional[Path], name: str, image: np.ndarray) -> None:
    if sess is None:
        return
    cv2.imwrite(str(sess / name), image)

def _dump_meta(sess: Optional[Path], meta: dict) -> None:
    if sess is None:
        return
    (sess / "meta.json").write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")

def run_from_bytes(
    image_bytes: bytes,
    lang: str = ocr.DEFAULT_LANG,
    spell_check: bool = True,
    encode_crop: bool = True,
    enhance_mode: str = "color",
    enhance_quality: int = 88,
    return_enhanced: bool = False,
    skip_ocr: bool = False,
    ocr_engine: str = "pytesseract",
    quad_override: Optional[np.ndarray] = None,
) -> PipelineResult:
    image = _decode(image_bytes)
    return run_from_array(
        image,
        lang=lang,
        spell_check=spell_check,
        encode_crop=encode_crop,
        enhance_mode=enhance_mode,
        enhance_quality=enhance_quality,
        return_enhanced=return_enhanced,
        skip_ocr=skip_ocr,
        ocr_engine=ocr_engine,
        quad_override=quad_override,
    )

def run_from_path(path: str, **kwargs) -> PipelineResult:
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(path)
    return run_from_array(img, **kwargs)

def run_from_array(
    image_bgr: np.ndarray,
    lang: str = ocr.DEFAULT_LANG,
    spell_check: bool = True,
    encode_crop: bool = True,
    enhance_mode: str = "color",
    enhance_quality: int = 88,
    return_enhanced: bool = False,
    skip_ocr: bool = False,
    ocr_engine: str = "pytesseract",
    quad_override: Optional[np.ndarray] = None,
) -> PipelineResult:
    if ocr_engine not in OCR_ENGINES:
        ocr_engine = "pytesseract"
    sess = _new_debug_session()
    meta: dict = {
        "lang": lang,
        "enhance_mode": enhance_mode,
        "ocr_engine": ocr_engine,
        "quad_override": quad_override is not None,
    }
    _dump(sess, "00_input.jpg", image_bgr)

    if quad_override is not None and quad_override.shape == (4, 2):
        warped = detector.warp_to_document(image_bgr, quad_override.astype(np.float32))
        det_detected = True
        det_score = 1.0
        meta["detection"] = {
            "document_detected": True,
            "score": 1.0,
            "source": "quad_override",
        }
        overlay = image_bgr.copy()
        cv2.polylines(overlay, [quad_override.astype(np.int32)], True, (0, 200, 255), 3)
        _dump(sess, "02_quad_overlay.jpg", overlay)
    else:
        det = detector.detect_document(image_bgr)
        meta["detection"] = {
            "document_detected": det.document_detected,
            "score": det.score,
            "debug": det.debug,
        }
        det_detected = det.document_detected
        det_score = det.score
        if det.document_detected and det.quad is not None:
            warped = detector.warp_to_document(image_bgr, det.quad)
            overlay = image_bgr.copy()
            cv2.polylines(overlay, [det.quad.astype(np.int32)], True, (0, 255, 0), 3)
            _dump(sess, "02_quad_overlay.jpg", overlay)
        else:
            warped = image_bgr.copy()

    h_w, w_w = warped.shape[:2]
    longest = max(h_w, w_w)
    if longest > PIPELINE_MAX_EDGE:
        scale = PIPELINE_MAX_EDGE / float(longest)
        new_w = max(1, int(round(w_w * scale)))
        new_h = max(1, int(round(h_w * scale)))
        warped = cv2.resize(warped, (new_w, new_h), interpolation=cv2.INTER_AREA)
        meta["downsampled"] = {"from": [h_w, w_w], "to": [new_h, new_w], "scale": scale}
    _dump(sess, "03_warped.jpg", warped)

    warped = detector.auto_orient(warped)
    _dump(sess, "04_oriented.jpg", warped)
    warped = detector.deskew(warped)
    _dump(sess, "05_deskewed.jpg", warped)
    warped = detector.normalize_dpi(warped)
    _dump(sess, "06_dpi_normalized.jpg", warped)

    raw_full = image_bgr

    enhanced_bytes: Optional[bytes] = None
    enhanced_mime = "image/jpeg"
    enhance_mode_used = enhance_mode
    if return_enhanced:
        try:
            enhanced_img = scanner_enhance.enhance(warped, mode=enhance_mode)
        except ValueError:
            enhance_mode_used = "color"
            enhanced_img = scanner_enhance.enhance(warped, mode="color")
        _dump(sess, f"10_enhanced_{enhance_mode_used}.jpg", enhanced_img)
        enhanced_bytes, enhanced_mime = scanner_enhance.encode(
            enhanced_img, enhance_mode_used, quality=enhance_quality
        )

    if skip_ocr:
        crop_jpg: Optional[bytes] = None
        if encode_crop:
            ok, buf = cv2.imencode(".jpg", warped, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
            if ok:
                crop_jpg = bytes(buf)
        meta["skipped_ocr"] = True
        _dump_meta(sess, meta)
        return PipelineResult(
            text="",
            mean_conf=0.0,
            language=lang,
            document_detected=det_detected,
            detection_score=det_score,
            psm_used=0,
            confidence_warning=None,
            words=[],
            text_alternatives=[],
            enhance_mode_used=enhance_mode_used,
            enhanced_mime=enhanced_mime,
            ocr_engine_used=ocr_engine,
            crop_jpg=crop_jpg,
            enhanced_bytes=enhanced_bytes,
        )

    engine_used = ocr_engine
    gray_path = enhancer.grayscale_path(warped)
    _dump(sess, "07_gray_path.jpg", gray_path)
    bin_path = enhancer.binarized_path(warped)
    _dump(sess, "08_binary_path.jpg", bin_path)

    printed_imgs = {"gray": gray_path, "binary": bin_path, "raw": raw_full}
    if ocr_engine == "from_scratch":
        if ocr_from_scratch.has_model():
            best, alts = ocr_from_scratch.run_printed(
                printed_imgs, lang=lang, spell_check=spell_check
            )
        else:
            best, alts = ocr.run_printed(
                printed_imgs, lang=lang, spell_check=spell_check
            )
            engine_used = "pytesseract"
            meta["from_scratch_fallback"] = "model_missing"
    else:
        best, alts = ocr.run_printed(
            printed_imgs, lang=lang, spell_check=spell_check
        )

    warning: Optional[str] = None
    if best.mean_conf < 50:
        warning = f"low confidence ({best.mean_conf:.1f}); result may be inaccurate"

    crop_jpg = None
    if encode_crop:
        ok, buf = cv2.imencode(".jpg", warped, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        if ok:
            crop_jpg = bytes(buf)

    meta["best"] = {
        "psm": best.psm,
        "lang": best.lang,
        "image_kind": best.image_kind,
        "mean_conf": best.mean_conf,
        "word_count": len(best.words),
    }
    meta["alternatives"] = [
        {
            "psm": p.psm,
            "lang": p.lang,
            "image_kind": p.image_kind,
            "mean_conf": p.mean_conf,
            "word_count": len(p.words),
        }
        for p in alts
    ]
    meta["engine_used"] = engine_used
    _dump_meta(sess, meta)

    return PipelineResult(
        text=best.text,
        mean_conf=best.mean_conf,
        language=lang,
        document_detected=det_detected,
        detection_score=det_score,
        psm_used=best.psm,
        confidence_warning=warning,
        words=[WordOut(text=w.text, conf=w.conf, bbox=w.bbox) for w in best.words],
        text_alternatives=[
            AlternativeOut(
                psm=p.psm,
                lang=p.lang,
                image_kind=p.image_kind,
                text=p.text,
                mean_conf=p.mean_conf,
                word_count=len(p.words),
            )
            for p in alts
        ],
        enhance_mode_used=enhance_mode_used,
        enhanced_mime=enhanced_mime,
        ocr_engine_used=engine_used,
        crop_jpg=crop_jpg,
        enhanced_bytes=enhanced_bytes,
    )
