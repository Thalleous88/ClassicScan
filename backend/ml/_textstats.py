from __future__ import annotations

import cv2
import numpy as np

def estimate_text_height(gray: np.ndarray, default: int = 20) -> int:
    if gray.size == 0:
        return default
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, bw = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    n, _, stats, _ = cv2.connectedComponentsWithStats(bw, connectivity=8)
    if n <= 1:
        return default
    h_img, w_img = gray.shape[:2]
    keep = []
    for i in range(1, n):
        h = stats[i, cv2.CC_STAT_HEIGHT]
        w = stats[i, cv2.CC_STAT_WIDTH]
        if h < 4 or h > h_img // 4:
            continue
        if w < 2 or w > w_img // 2:
            continue
        ar = w / max(1, h)
        if ar < 0.2 or ar > 5.0:
            continue
        keep.append(h)
    if not keep:
        return default
    arr = np.asarray(keep, dtype=np.int32)
    hist, edges = np.histogram(arr, bins=min(20, max(5, len(arr) // 3)))
    if hist.sum() == 0:
        return int(np.median(arr))
    idx = int(np.argmax(hist))
    mode_lo, mode_hi = edges[idx], edges[idx + 1]
    selected = arr[(arr >= mode_lo) & (arr <= mode_hi)]
    if selected.size == 0:
        return int(np.median(arr))
    return int(np.median(selected))

def count_text_components(gray: np.ndarray, mask: np.ndarray | None = None) -> int:
    if gray.size == 0:
        return 0
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, bw = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    if mask is not None:
        bw = cv2.bitwise_and(bw, mask)
    n, _, stats, _ = cv2.connectedComponentsWithStats(bw, connectivity=8)
    if n <= 1:
        return 0
    h_img, w_img = gray.shape[:2]
    count = 0
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
        count += 1
    return count

def laplacian_variance(gray: np.ndarray, mask: np.ndarray | None = None) -> float:
    if gray.size == 0:
        return 0.0
    lap = cv2.Laplacian(gray, cv2.CV_64F, ksize=3)
    if mask is not None:
        m = mask > 0
        if m.sum() == 0:
            return 0.0
        return float(lap[m].var())
    return float(lap.var())
