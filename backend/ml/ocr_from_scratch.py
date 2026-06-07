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
CROSSING_POSITIONS = 4

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
    if bw_inv_line.size == 0:
        return []
    h = bw_inv_line.shape[0]

    n, _, stats, _ = cv2.connectedComponentsWithStats(bw_inv_line, connectivity=8)
    if n <= 1:
        return []

    cc_spans: list[tuple[int, int]] = []
    for i in range(1, n):
        x = int(stats[i, cv2.CC_STAT_LEFT])
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < 3 or w < 1:
            continue
        cc_spans.append((x, x + w))

    if len(cc_spans) < 2:
        col = bw_inv_line.sum(axis=0).astype(np.float32)
        active = col > 0
        xs = np.where(active)[0]
        if len(xs) == 0:
            return []
        return [(int(xs[0]), int(xs[-1]) + 1)]

    cc_spans.sort(key=lambda s: s[0])

    merged_spans: list[tuple[int, int]] = [cc_spans[0]]
    for start, end in cc_spans[1:]:
        prev_start, prev_end = merged_spans[-1]
        if start <= prev_end + 1:
            merged_spans[-1] = (prev_start, max(prev_end, end))
        else:
            merged_spans.append((start, end))

    if len(merged_spans) < 2:
        col = bw_inv_line.sum(axis=0).astype(np.float32)
        active = col > 0
        xs = np.where(active)[0]
        if len(xs) == 0:
            return []
        return [(int(xs[0]), int(xs[-1]) + 1)]

    gaps: list[int] = []
    for i in range(1, len(merged_spans)):
        gap = merged_spans[i][0] - merged_spans[i - 1][1]
        gaps.append(gap)

    if not gaps:
        col = bw_inv_line.sum(axis=0).astype(np.float32)
        active = col > 0
        xs = np.where(active)[0]
        if len(xs) == 0:
            return []
        return [(int(xs[0]), int(xs[-1]) + 1)]

    gap_arr = np.array(gaps, dtype=np.float32)
    if len(gaps) >= 4:
        sorted_gaps = np.sort(gap_arr)
        q25 = float(sorted_gaps[len(sorted_gaps) // 4])
        q75 = float(sorted_gaps[3 * len(sorted_gaps) // 4])
        iqr = q75 - q25
        if iqr > 1:
            threshold = q25 + 0.5 * iqr
        else:
            threshold = float(np.median(gap_arr)) * 1.2
        threshold = max(threshold, max(3, h * 0.15))
        threshold = min(threshold, max(6, h * 0.5))
    else:
        median_gap = float(np.median(gap_arr))
        threshold = max(median_gap * 1.3, max(3, h * 0.15))
        threshold = min(threshold, max(6, h * 0.5))

    word_bands: list[tuple[int, int]] = []
    word_start = merged_spans[0][0]
    word_end = merged_spans[0][1]
    for i, gap in enumerate(gaps):
        if gap >= threshold:
            word_bands.append((word_start, word_end))
            word_start = merged_spans[i + 1][0]
            word_end = merged_spans[i + 1][1]
        else:
            word_end = max(word_end, merged_spans[i + 1][1])
    word_bands.append((word_start, word_end))
    return word_bands


def _split_wide_cc(
    cc_box: tuple[int, int, int, int], median_h: float
) -> list[tuple[int, int, int, int]]:
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


def _merge_dots_to_stems(
    boxes: list[tuple[int, int, int, int]], median_h: float
) -> list[tuple[int, int, int, int]]:
    if not boxes or median_h <= 0:
        return boxes

    stem_thresh = max(2, median_h * 0.12)
    dot_max_h = max(4, median_h * 0.35)
    dot_max_w = max(3, median_h * 0.30)

    stems: list[tuple[int, int, int, int]] = []
    dots: list[tuple[int, int, int, int]] = []
    others: list[tuple[int, int, int, int]] = []

    for b in boxes:
        x, y, w, h = b
        aspect = w / max(1.0, h)
        if h <= dot_max_h and w <= dot_max_w and aspect <= 1.5:
            dots.append(b)
        elif h > median_h * 0.4 and aspect < 0.6 and w <= stem_thresh:
            stems.append(b)
        else:
            others.append(b)

    if not dots or not stems:
        return boxes

    merged_boxes: list[tuple[int, int, int, int]] = list(others)
    used_dots: set[int] = set()

    for stem in stems:
        sx, sy, sw, sh = stem
        s_cx = sx + sw / 2.0
        s_top = sy
        best_dot_idx: Optional[int] = None
        best_dist = float("inf")
        for di, dot in enumerate(dots):
            if di in used_dots:
                continue
            dx, dy, dw, dh = dot
            d_cx = dx + dw / 2.0
            d_bottom = dy + dh
            x_overlap = abs(d_cx - s_cx)
            if x_overlap > max(sw, dw) * 1.2:
                continue
            if d_bottom > s_top + median_h * 0.15:
                continue
            vert_dist = s_top - d_bottom
            if vert_dist < 0 or vert_dist > median_h * 0.5:
                continue
            dist = x_overlap + vert_dist
            if dist < best_dist:
                best_dist = dist
                best_dot_idx = di

        if best_dot_idx is not None:
            used_dots.add(best_dot_idx)
            dot = dots[best_dot_idx]
            dx, dy, dw, dh = dot
            new_x = min(sx, dx)
            new_y = min(sy, dy)
            new_w = max(sx + sw, dx + dw) - new_x
            new_h = max(sy + sh, dy + dh) - new_y
            merged_boxes.append((new_x, new_y, new_w, new_h))
        else:
            merged_boxes.append(stem)

    for di, dot in enumerate(dots):
        if di not in used_dots:
            merged_boxes.append(dot)

    merged_boxes.sort(key=lambda b: b[0])
    return merged_boxes


def _segment_chars(
    bw_inv_word: np.ndarray, median_h: float
) -> list[tuple[int, int, int, int]]:
    if bw_inv_word.size == 0:
        return []

    if median_h > 10:
        ksize = 1
        kern = cv2.getStructuringElement(cv2.MORPH_RECT, (ksize, ksize))
        bw_clean = cv2.morphologyEx(bw_inv_word, cv2.MORPH_CLOSE, kern, iterations=1)
    else:
        bw_clean = bw_inv_word

    n, _, stats, _ = cv2.connectedComponentsWithStats(bw_clean, connectivity=8)
    if n <= 1:
        return []

    dot_max_h = max(4, median_h * 0.40)
    dot_max_w = max(4, median_h * 0.35)

    all_ccs: list[tuple[int, int, int, int]] = []
    for i in range(1, n):
        x = int(stats[i, cv2.CC_STAT_LEFT])
        y = int(stats[i, cv2.CC_STAT_TOP])
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        h = int(stats[i, cv2.CC_STAT_HEIGHT])
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < 2:
            continue
        if h < 2 or w < 1:
            continue
        all_ccs.append((x, y, w, h))

    boxes = _merge_dots_to_stems(all_ccs, median_h)

    if not boxes:
        return []

    boxes.sort(key=lambda b: b[0])
    out: list[tuple[int, int, int, int]] = []
    for b in boxes:
        out.extend(_split_wide_cc(b, median_h))
    return out


def _normalize_glyph(crop: np.ndarray) -> np.ndarray:
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
    cells = ZONING_GRID
    step = CHAR_BOX // cells
    out = np.zeros(cells * cells, dtype=np.float32)
    for r in range(cells):
        for c in range(cells):
            cell = glyph[r * step : (r + 1) * step, c * step : (c + 1) * step]
            out[r * cells + c] = float(cell.mean()) / 255.0
    return out


def _crossing_features(glyph: np.ndarray) -> np.ndarray:
    h, w = glyph.shape[:2]
    feats: list[float] = []
    for pos_frac in [0.25, 0.5, 0.75]:
        row = int(round(h * pos_frac))
        row = min(row, h - 1)
        transitions = 0
        for x in range(1, w):
            if (glyph[row, x] > 0) != (glyph[row, x - 1] > 0):
                transitions += 1
        feats.append(float(transitions) / max(1, w))

    for pos_frac in [0.25, 0.5, 0.75]:
        col = int(round(w * pos_frac))
        col = min(col, w - 1)
        transitions = 0
        for y in range(1, h):
            if (glyph[y, col] > 0) != (glyph[y - 1, col] > 0):
                transitions += 1
        feats.append(float(transitions) / max(1, h))

    return np.array(feats, dtype=np.float32)


def _hole_features(glyph: np.ndarray) -> np.ndarray:
    inv = (glyph == 0).astype(np.uint8)
    n, _ = cv2.connectedComponents(inv, connectivity=4)
    holes = max(0, n - 2)
    return np.array([min(float(holes), 3.0) / 3.0], dtype=np.float32)


def _shape_features(crop: np.ndarray, line_h: float = 0.0) -> np.ndarray:
    h, w = crop.shape[:2]
    aspect = float(w) / max(1.0, float(h))
    fill = float((crop > 0).mean())
    if line_h > 0:
        relative_h = float(h) / line_h
    else:
        relative_h = 0.5
    return np.array(
        [np.tanh(np.log(aspect + 1e-6)), fill, min(relative_h, 2.0) / 2.0],
        dtype=np.float32,
    )


def char_features(
    glyph_uint8: np.ndarray, line_h: float = 0.0
) -> np.ndarray:
    norm = _normalize_glyph(glyph_uint8)
    return np.concatenate(
        [
            _hog_features(norm),
            _zoning_features(norm),
            _crossing_features(norm),
            _hole_features(norm),
            _shape_features(glyph_uint8, line_h=line_h),
        ],
        axis=0,
    ).astype(np.float32)


FEATURE_DIM = (
    (CHAR_BOX // HOG_CELL) ** 2 * HOG_BIN
    + ZONING_GRID * ZONING_GRID
    + 6
    + 1
    + 3
)


def _predict_chars(
    glyphs: list[np.ndarray], line_h: float = 0.0
) -> tuple[list[str], list[float]]:
    model, labels = _load_model()
    if model is None or labels is None or not glyphs:
        return [], []
    X = np.stack([char_features(g, line_h=line_h) for g in glyphs], axis=0)
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


def _clean_bw(bw_inv: np.ndarray, median_h: float) -> np.ndarray:
    if bw_inv.size == 0 or median_h <= 0:
        return bw_inv
    n, labels, stats, _ = cv2.connectedComponentsWithStats(bw_inv, connectivity=8)
    if n <= 1:
        return bw_inv
    min_area = max(3, int(median_h * 0.15))
    keep = np.ones(n, dtype=bool)
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        h = int(stats[i, cv2.CC_STAT_HEIGHT])
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        if area < min_area and h < max(3, median_h * 0.15) and w < max(3, median_h * 0.15):
            keep[i] = False
    mask = keep[labels]
    return np.where(mask, bw_inv, 0).astype(np.uint8)


def _estimate_median_cc_height(bw_inv: np.ndarray) -> float:
    if bw_inv.size == 0:
        return 0.0
    n, _, stats, _ = cv2.connectedComponentsWithStats(bw_inv, connectivity=8)
    if n <= 1:
        return 0.0
    heights = []
    for i in range(1, n):
        h = int(stats[i, cv2.CC_STAT_HEIGHT])
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area >= 4 and h >= 4:
            heights.append(h)
    if not heights:
        return 0.0
    return float(np.median(heights))


def _case_correct_word(text: str, confs: list[float], line_h: Optional[float] = None) -> str:
    if not text or not confs:
        return text
    chars = list(text)
    n_upper = sum(1 for c in chars if c.isupper())
    n_lower = sum(1 for c in chars if c.islower())
    n_alpha = n_upper + n_lower
    if n_alpha == 0:
        return text

    upper_ratio = n_upper / n_alpha
    low_conf_thresh = 50.0

    if upper_ratio > 0.6 and len(chars) > 2:
        new_chars = []
        for i, c in enumerate(chars):
            if c.isupper() and i > 0 and confs[i] < low_conf_thresh:
                new_chars.append(c.lower())
            else:
                new_chars.append(c)
        return "".join(new_chars)

    for i, c in enumerate(chars):
        if c.islower() and i == 0 and len(chars) > 1 and confs[i] < low_conf_thresh:
            if chars[1].islower() or not chars[1].isalpha():
                pass

    return text


def _ocr_image(image: np.ndarray) -> tuple[str, float, list[Word]]:
    bw_inv = _bw_inverted(image)
    line_bands = _segment_lines(bw_inv)
    if not line_bands:
        return "", 0.0, []

    median_cc_h = _estimate_median_cc_height(bw_inv)
    if median_cc_h > 0:
        bw_inv = _clean_bw(bw_inv, median_cc_h)

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
            chars, char_confs = _predict_chars(glyphs, line_h=float(line_h))
            if not chars:
                continue
            text = "".join(chars).strip()
            if not text:
                continue
            text = _case_correct_word(text, char_confs, line_h=float(line_h))
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


def _maybe_spell_correct(text: str, words: list[Word]) -> str:
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
