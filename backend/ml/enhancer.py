from __future__ import annotations

import cv2
import numpy as np

from . import _textstats

try:
    from skimage.filters import threshold_sauvola

    _HAS_SKIMAGE = True
except Exception:
    _HAS_SKIMAGE = False

def _shadow_free_gray(gray: np.ndarray) -> np.ndarray:
    den = cv2.bilateralFilter(gray, d=7, sigmaColor=50, sigmaSpace=50)
    th = max(_textstats.estimate_text_height(den), 8)
    k = max(15, th * 5)
    if k % 2 == 0:
        k += 1
    if k > 151:
        small_factor = k / 151.0
        h, w = den.shape[:2]
        small = cv2.resize(den, (max(1, int(w / small_factor)), max(1, int(h / small_factor))), interpolation=cv2.INTER_AREA)
        bg_small = cv2.medianBlur(small, 151)
        bg = cv2.resize(bg_small, (w, h), interpolation=cv2.INTER_LINEAR)
    else:
        bg = cv2.medianBlur(den, k)
    norm = cv2.divide(den, bg, scale=255)
    return cv2.normalize(norm, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

def grayscale_path(image_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    return _shadow_free_gray(gray)

def binarized_path(image_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    flat = _shadow_free_gray(gray)
    th_h = max(_textstats.estimate_text_height(flat), 8)
    win = max(25, int(th_h * 1.5))
    if win % 2 == 0:
        win += 1
    if _HAS_SKIMAGE:
        t = threshold_sauvola(flat, window_size=win, k=0.2)
        bw = (flat > t).astype(np.uint8) * 255
    else:
        bw = cv2.adaptiveThreshold(
            flat, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, win, 10
        )
    inv = cv2.bitwise_not(bw)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=8)
    if n > 1:
        median_h = max(_textstats.estimate_text_height(flat), 6)
        keep = np.ones(n, dtype=bool)
        for i in range(1, n):
            h = stats[i, cv2.CC_STAT_HEIGHT]
            w = stats[i, cv2.CC_STAT_WIDTH]
            area = stats[i, cv2.CC_STAT_AREA]
            if h < max(2, median_h // 6) and w < max(2, median_h // 6) and area < 6:
                keep[i] = False
        mask = keep[labels]
        cleaned = np.where(mask, inv, 0).astype(np.uint8)
        bw = cv2.bitwise_not(cleaned)
    return bw
