from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from . import _textstats

@dataclass
class ClassificationResult:
    is_handwriting: bool
    confidence: float
    signals: dict

def _stroke_width_variance(gray: np.ndarray) -> float:
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    if bw.sum() == 0:
        return 0.0
    dist = cv2.distanceTransform(bw, cv2.DIST_L2, 3)
    kernel = np.ones((3, 3), np.uint8)
    local_max = cv2.dilate(dist, kernel)
    skeleton = (dist >= local_max - 1e-6) & (dist >= 1.5)
    sw = dist[skeleton]
    if sw.size < 30:
        return 0.0
    mean = float(sw.mean())
    if mean < 1e-6:
        return 0.0
    return float(sw.std() / mean)

def _font_stroke_regularity(gray: np.ndarray) -> float:
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    if bw.sum() == 0:
        return 0.0
    dist = cv2.distanceTransform(bw, cv2.DIST_L2, 3)
    kernel = np.ones((3, 3), np.uint8)
    local_max = cv2.dilate(dist, kernel)
    skeleton = (dist >= local_max - 1e-6) & (dist >= 1.5)
    sw = dist[skeleton]
    if sw.size < 60:
        return 0.0

    sw = np.clip(sw, 1.0, 12.0)
    hist, _ = np.histogram(sw, bins=16, range=(1.0, 12.0))
    total = float(hist.sum())
    if total <= 0:
        return 0.0
    return float(hist.max()) / total

def _cc_height_cv(gray: np.ndarray) -> float:
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    n, _, stats, _ = cv2.connectedComponentsWithStats(bw, connectivity=8)
    if n <= 1:
        return 0.0
    h_img, w_img = gray.shape[:2]
    heights = []
    for i in range(1, n):
        h = stats[i, cv2.CC_STAT_HEIGHT]
        w = stats[i, cv2.CC_STAT_WIDTH]
        area = stats[i, cv2.CC_STAT_AREA]
        if h < 6 or h > h_img // 4:
            continue
        if w < 2 or w > w_img // 2:
            continue
        ar = w / max(1, h)
        if ar < 0.1 or ar > 8.0:
            continue
        if area < 12:
            continue
        heights.append(h)
    if len(heights) < 20:
        return 0.0
    arr = np.asarray(heights, dtype=np.float32)
    mean = float(arr.mean())
    if mean < 1e-6:
        return 0.0
    return float(arr.std() / mean)

def _baseline_regularity(gray: np.ndarray) -> float:
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    proj = bw.sum(axis=1).astype(np.float32)
    if proj.max() == 0:
        return 1.0
    proj /= proj.max()
    in_line = proj > 0.15
    gaps: list[int] = []
    run = 0
    prev = False
    line_starts: list[int] = []
    for i, v in enumerate(in_line):
        if v and not prev:
            line_starts.append(i)
        prev = v
    if len(line_starts) < 3:
        return 1.0
    spacings = np.diff(line_starts)
    if spacings.size == 0:
        return 1.0
    mean = float(spacings.mean())
    if mean < 1e-6:
        return 1.0
    return float(spacings.std() / mean)

def _gap_entropy(gray: np.ndarray) -> float:
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    proj = bw.sum(axis=1).astype(np.float32)
    if proj.max() == 0:
        return 0.0
    proj /= proj.max()
    in_line = proj > 0.15
    h = bw.shape[0]
    line_rows: list[tuple[int, int]] = []
    start = None
    for i, v in enumerate(in_line):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= 4:
                line_rows.append((start, i))
            start = None
    if start is not None and h - start >= 4:
        line_rows.append((start, h))
    if not line_rows:
        return 0.0
    gaps_all: list[int] = []
    for y0, y1 in line_rows[:6]:
        strip = bw[y0:y1, :]
        col_sum = strip.sum(axis=0)
        col_active = col_sum > 0
        run_blank = 0
        for v in col_active:
            if not v:
                run_blank += 1
            else:
                if run_blank > 0:
                    gaps_all.append(run_blank)
                run_blank = 0
    if len(gaps_all) < 10:
        return 0.0
    arr = np.array(gaps_all, dtype=np.float32)
    hist, _ = np.histogram(arr, bins=12)
    p = hist / max(1, hist.sum())
    p = p[p > 0]
    if p.size == 0:
        return 0.0
    entropy = float(-(p * np.log(p)).sum())
    return entropy / np.log(12)

def classify(warped_bgr: np.ndarray) -> ClassificationResult:
    gray = cv2.cvtColor(warped_bgr, cv2.COLOR_BGR2GRAY)
    if _textstats.count_text_components(gray) < 10:
        return ClassificationResult(False, 0.0, {"reason": "too_little_text"})

    sw = _stroke_width_variance(gray)
    cv_h = _cc_height_cv(gray)
    br = _baseline_regularity(gray)
    ge = _gap_entropy(gray)
    font_reg = _font_stroke_regularity(gray)

    printed_override = (cv_h <= 0.25) and (br <= 0.10) and (ge <= 0.50)

    sw_n = min(1.0, max(0.0, (sw - 0.30) / 0.25))
    cv_n = min(1.0, max(0.0, (cv_h - 0.30) / 0.40))
    br_n = min(1.0, max(0.0, (br - 0.10) / 0.40))
    ge_n = min(1.0, max(0.0, (ge - 0.55) / 0.30))

    font_irreg_n = min(1.0, max(0.0, (0.50 - font_reg) / 0.20))

    score = (
        cv_n * 0.40
        + sw_n * 0.15
        + br_n * 0.15
        + ge_n * 0.10
        + font_irreg_n * 0.20
    )

    if printed_override:
        is_hw = False
    else:
        is_hw = score >= 0.62

    return ClassificationResult(
        is_handwriting=is_hw,
        confidence=score,
        signals={
            "stroke_width_var": sw,
            "cc_height_cv": cv_h,
            "baseline_irregularity": br,
            "gap_entropy": ge,
            "font_stroke_regularity": font_reg,
            "sw_n": sw_n,
            "cv_n": cv_n,
            "br_n": br_n,
            "ge_n": ge_n,
            "font_irreg_n": font_irreg_n,
            "printed_override": printed_override,
            "score": score,
        },
    )
