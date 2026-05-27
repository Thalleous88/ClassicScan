from __future__ import annotations

import logging
import os
import string
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from . import enhancer

_log = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_PATH = MODEL_DIR / "from_scratch_ocr.joblib"

CHAR_BOX = 32
HOG_CELL = 8
HOG_BIN = 9
ZONING_GRID = 4

ALPHABET: list[str] = (
    list(string.ascii_uppercase)
    + list(string.ascii_lowercase)
    + list(string.digits)
    + list(".,;:!?'\"()[]{}-_/\\@#&%+=*<>")
)


@dataclass
class Word:
    text: str
    conf: float
    bbox: tuple[int, int, int, int]
    block_num: int = 0
    par_num: int = 0
    line_num: int = 0


@dataclass
class OcrPass:
    psm: int
    lang: str
    image_kind: str
    text: str
    mean_conf: float
    words: list[Word] = field(default_factory=list)


_MODEL_CACHE: Optional[object] = None
_LABELS_CACHE: Optional[list[str]] = None


def _load_model() -> tuple[Optional[object], Optional[list[str]]]:
    """Load the trained classifier on first use. Tolerant of missing model."""
    global _MODEL_CACHE, _LABELS_CACHE
    if _MODEL_CACHE is not None:
        return _MODEL_CACHE, _LABELS_CACHE
    if not MODEL_PATH.exists():
        _log.warning(
            "from-scratch model not found at %s; engine will return empty results. "
            "Run `python -m ml.train_from_scratch` to build it.",
            MODEL_PATH,
        )
        return None, None
    try:
        import joblib

        bundle = joblib.load(MODEL_PATH)
        _MODEL_CACHE = bundle["model"]
        _LABELS_CACHE = list(bundle["labels"])
        _log.info(
            "from-scratch model loaded: %d classes, %s",
            len(_LABELS_CACHE),
            type(_MODEL_CACHE).__name__,
        )
        return _MODEL_CACHE, _LABELS_CACHE
    except Exception:
        _log.exception("failed to load from-scratch model from %s", MODEL_PATH)
        return None, None


def has_model() -> bool:
    return MODEL_PATH.exists()




def _segment_lines(bw_inv: np.ndarray) -> list[tuple[int, int]]:
    """Find (y0, y1) bands containing text lines via projection profile."""
    if bw_inv.size == 0:
        return []
    proj = bw_inv.sum(axis=1).astype(np.float32)
    if proj.max() <= 0:
        return []
    norm = proj / proj.max()
    threshold = max(0.04, norm.mean() * 0.35)
    in_line = norm > threshold
    bands: list[tuple[int, int]] = []
    start: Optional[int] = None
    for i, v in enumerate(in_line):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= 6:
                bands.append((start, i))
            start = None
    if start is not None and bw_inv.shape[0] - start >= 6:
        bands.append((start, bw_inv.shape[0]))
    merged: list[tuple[int, int]] = []
    for b in bands:
        if merged and b[0] - merged[-1][1] <= 2:
            merged[-1] = (merged[-1][0], b[1])
        else:
            merged.append(b)
    return merged


def _segment_words(bw_inv_line: np.ndarray) -> list[tuple[int, int]]:
    """Find (x0, x1) word bands inside a single line strip."""
    if bw_inv_line.size == 0:
        return []
    col = bw_inv_line.sum(axis=0).astype(np.float32)
    active = col > 0
    h = bw_inv_line.shape[0]
    gap_thresh = max(4, int(round(h * 0.45)))
    bands: list[tuple[int, int]] = []
    start: Optional[int] = None
    blank_run = 0
    last_active = -1
    for i, v in enumerate(active):
        if v:
            if start is None:
                start = i
            last_active = i
            blank_run = 0
        else:
            if start is not None:
                blank_run += 1
                if blank_run >= gap_thresh:
                    bands.append((start, last_active + 1))
                    start = None
                    blank_run = 0
    if start is not None:
        bands.append((start, last_active + 1))
    return bands


def _split_wide_cc(
    cc_box: tuple[int, int, int, int], median_h: float
) -> list[tuple[int, int, int, int]]:
    """Split a connected component box that's too wide to be a single char.

    Real touching letters; we just slice equally — accuracy is approximate
    by design.
    """
    x, y, w, h = cc_box
    if median_h <= 0 or w <= median_h * 1.2:
        return [cc_box]
    parts = max(2, int(round(w / max(1.0, median_h * 0.7))))
    parts = min(parts, 6)
    step = w / parts
    out: list[tuple[int, int, int, int]] = []
    for i in range(parts):
        x0 = int(round(x + i * step))
        x1 = int(round(x + (i + 1) * step))
        out.append((x0, y, max(1, x1 - x0), h))
    return out


def _segment_chars(
    bw_inv_word: np.ndarray, median_h: float
) -> list[tuple[int, int, int, int]]:
    """Find character bboxes inside a single word strip via CCs."""
    if bw_inv_word.size == 0:
        return []
    n, _, stats, _ = cv2.connectedComponentsWithStats(bw_inv_word, connectivity=8)
    if n <= 1:
        return []
    boxes: list[tuple[int, int, int, int]] = []
    for i in range(1, n):
        x = int(stats[i, cv2.CC_STAT_LEFT])
        y = int(stats[i, cv2.CC_STAT_TOP])
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        h = int(stats[i, cv2.CC_STAT_HEIGHT])
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < 4:
            continue
        if h < max(4, median_h * 0.25) and w < max(4, median_h * 0.25):
            continue
        boxes.append((x, y, w, h))
    if not boxes:
        return []
    boxes.sort(key=lambda b: b[0])
    out: list[tuple[int, int, int, int]] = []
    for b in boxes:
        out.extend(_split_wide_cc(b, median_h))
    return out




def _normalize_glyph(crop: np.ndarray) -> np.ndarray:
    """Center a binary glyph in a fixed-size square canvas."""
    h, w = crop.shape[:2]
    if h == 0 or w == 0:
        return np.zeros((CHAR_BOX, CHAR_BOX), dtype=np.uint8)
    target = CHAR_BOX - 4
    s = target / max(h, w)
    new_w = max(1, int(round(w * s)))
    new_h = max(1, int(round(h * s)))
    resized = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((CHAR_BOX, CHAR_BOX), dtype=np.uint8)
    ox = (CHAR_BOX - new_w) // 2
    oy = (CHAR_BOX - new_h) // 2
    canvas[oy : oy + new_h, ox : ox + new_w] = resized
    return canvas


def _hog_features(glyph: np.ndarray) -> np.ndarray:
    """Compact HOG: gradients pooled into HOG_CELL x HOG_CELL cells."""
    g = glyph.astype(np.float32) / 255.0
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.sqrt(gx * gx + gy * gy)
    ang = (np.arctan2(gy, gx) * 180.0 / np.pi) % 180.0
    bins = np.clip((ang / (180.0 / HOG_BIN)).astype(np.int32), 0, HOG_BIN - 1)
    cells = CHAR_BOX // HOG_CELL
    feat = np.zeros((cells, cells, HOG_BIN), dtype=np.float32)
    for r in range(cells):
        for c in range(cells):
            y0 = r * HOG_CELL
            x0 = c * HOG_CELL
            cell_mag = mag[y0 : y0 + HOG_CELL, x0 : x0 + HOG_CELL]
            cell_bin = bins[y0 : y0 + HOG_CELL, x0 : x0 + HOG_CELL]
            for b in range(HOG_BIN):
                feat[r, c, b] = float(cell_mag[cell_bin == b].sum())
    flat = feat.reshape(-1)
    n = np.linalg.norm(flat) + 1e-6
    return (flat / n).astype(np.float32)


def _zoning_features(glyph: np.ndarray) -> np.ndarray:
    """Density of each cell in a coarse grid."""
    cells = ZONING_GRID
    step = CHAR_BOX // cells
    out = np.zeros(cells * cells, dtype=np.float32)
    for r in range(cells):
        for c in range(cells):
            cell = glyph[r * step : (r + 1) * step, c * step : (c + 1) * step]
            out[r * cells + c] = float(cell.mean()) / 255.0
    return out


def _shape_features(crop: np.ndarray) -> np.ndarray:
    """Aspect ratio + filled fraction — small but informative."""
    h, w = crop.shape[:2]
    aspect = float(w) / max(1.0, float(h))
    fill = float((crop > 0).mean())
    return np.array([np.tanh(np.log(aspect + 1e-6)), fill], dtype=np.float32)


def char_features(glyph_uint8: np.ndarray) -> np.ndarray:
    """Public API used by both inference and the trainer."""
    norm = _normalize_glyph(glyph_uint8)
    return np.concatenate(
        [_hog_features(norm), _zoning_features(norm), _shape_features(glyph_uint8)],
        axis=0,
    ).astype(np.float32)


FEATURE_DIM = (CHAR_BOX // HOG_CELL) ** 2 * HOG_BIN + ZONING_GRID * ZONING_GRID + 2




def _predict_chars(glyphs: list[np.ndarray]) -> tuple[list[str], list[float]]:
    model, labels = _load_model()
    if model is None or labels is None or not glyphs:
        return [], []
    X = np.stack([char_features(g) for g in glyphs], axis=0)
    try:
        if hasattr(model, "predict_proba"):
            probs = model.predict_proba(X)
            idx = probs.argmax(axis=1)
            chars = [labels[i] for i in idx]
            confs = [float(probs[i, idx[i]] * 100.0) for i in range(len(idx))]
        else:
            preds = model.predict(X)
            chars = [str(p) for p in preds]
            confs = [70.0] * len(chars)
    except Exception:
        _log.exception("from-scratch classifier predict failed")
        return [], []
    return chars, confs


def _bw_inverted(image: np.ndarray) -> np.ndarray:
    """Return a uint8 inverted-binary image where ink == 255."""
    if image.ndim == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    if gray.dtype != np.uint8:
        gray = gray.astype(np.uint8)
    unique_count = len(np.unique(gray[::8, ::8]))
    if unique_count <= 4:
        return cv2.bitwise_not(gray)
    return cv2.bitwise_not(
        cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
        )
    )


def _ocr_image(image: np.ndarray) -> tuple[str, float, list[Word]]:
    bw_inv = _bw_inverted(image)
    line_bands = _segment_lines(bw_inv)
    if not line_bands:
        return "", 0.0, []
    lines_out: list[str] = []
    words_out: list[Word] = []
    confs: list[float] = []
    for line_idx, (y0, y1) in enumerate(line_bands):
        line_strip = bw_inv[y0:y1, :]
        word_bands = _segment_words(line_strip)
        if not word_bands:
            continue
        line_h = y1 - y0
        line_words: list[str] = []
        for word_idx, (x0, x1) in enumerate(word_bands):
            word_strip = line_strip[:, x0:x1]
            char_boxes = _segment_chars(word_strip, median_h=float(line_h))
            if not char_boxes:
                continue
            glyphs: list[np.ndarray] = []
            for cx, cy, cw, ch in char_boxes:
                pad = max(1, int(round(line_h * 0.05)))
                gy0 = max(0, cy - pad)
                gy1 = min(word_strip.shape[0], cy + ch + pad)
                gx0 = max(0, cx - pad)
                gx1 = min(word_strip.shape[1], cx + cw + pad)
                glyphs.append(word_strip[gy0:gy1, gx0:gx1])
            chars, char_confs = _predict_chars(glyphs)
            if not chars:
                continue
            text = "".join(chars).strip()
            if not text:
                continue
            confs.extend(char_confs)
            line_words.append(text)
            mean_word_conf = float(np.mean(char_confs)) if char_confs else 0.0
            words_out.append(
                Word(
                    text=text,
                    conf=mean_word_conf,
                    bbox=(int(x0), int(y0), int(x1 - x0), int(y1 - y0)),
                    block_num=0,
                    par_num=0,
                    line_num=line_idx,
                )
            )
        if line_words:
            lines_out.append(" ".join(line_words))
    text = "\n".join(lines_out)
    mean_conf = float(np.mean(confs)) if confs else 0.0
    return text, mean_conf, words_out




def run_printed(
    images: dict[str, np.ndarray],
    lang: str = "eng",
    spell_check: bool = False,
) -> tuple[OcrPass, list[OcrPass]]:
    """Mirror of `ocr.run_printed`. Reuses the binary input."""
    bin_img = images.get("binary")
    if bin_img is None:
        bin_img = enhancer.binarized_path(images.get("raw", np.zeros((1, 1, 3), np.uint8)))

    text, mean_conf, words = _ocr_image(bin_img)

    if spell_check and text:
        text = _maybe_spell_correct(text, words)

    best = OcrPass(
        psm=0,
        lang=lang,
        image_kind="from_scratch_binary",
        text=text,
        mean_conf=mean_conf,
        words=words,
    )
    return best, [best]


def run_handwriting(
    images: dict[str, np.ndarray],
    spell_check: bool = False,
) -> tuple[OcrPass, list[OcrPass]]:
    """Handwriting is unsupported by the from-scratch engine.

    The pipeline is responsible for falling back to pytesseract; we still
    return a valid (empty) OcrPass so downstream code does not crash if it
    is ever called directly.
    """
    empty = OcrPass(
        psm=0,
        lang="eng",
        image_kind="from_scratch_unsupported",
        text="",
        mean_conf=0.0,
        words=[],
    )
    return empty, [empty]


def _maybe_spell_correct(text: str, words: list[Word]) -> str:
    """Best-effort spell correction; identical contract to ocr._spell_correct."""
    try:
        from importlib.resources import files as resource_files

        from symspellpy import SymSpell, Verbosity
    except Exception:
        return text
    try:
        sym = SymSpell(max_dictionary_edit_distance=2, prefix_length=7)
        dict_path = str(resource_files("symspellpy") / "frequency_dictionary_en_82_765.txt")
        if not sym.load_dictionary(dict_path, term_index=0, count_index=1):
            return text
    except Exception:
        return text
    out_tokens: list[str] = []
    for tok in text.split(" "):
        stripped = tok.strip(".,;:!?\"'()[]{}")
        if not stripped or any(ch.isdigit() for ch in stripped):
            out_tokens.append(tok)
            continue
        if not stripped.isalpha() or len(stripped) < 3:
            out_tokens.append(tok)
            continue
        try:
            sugg = sym.lookup(stripped.lower(), Verbosity.TOP, max_edit_distance=2)
        except Exception:
            out_tokens.append(tok)
            continue
        if sugg:
            corrected = sugg[0].term
            if stripped[0].isupper():
                corrected = corrected.capitalize()
            out_tokens.append(tok.replace(stripped, corrected))
        else:
            out_tokens.append(tok)
    return " ".join(out_tokens)
