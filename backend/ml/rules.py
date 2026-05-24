from __future__ import annotations

import cv2
import numpy as np

def _line_mask(gray: np.ndarray, axis: str) -> np.ndarray:
    h, w = gray.shape[:2]
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    if axis == "h":
        min_len = max(40, int(w * 0.4))
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (min_len // 2, 1))
    else:
        min_len = max(40, int(h * 0.4))
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_len // 2))
    extracted = cv2.morphologyEx(bw, cv2.MORPH_OPEN, kernel, iterations=1)
    if axis == "h":
        dil = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 3))
    else:
        dil = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 1))
    return cv2.dilate(extracted, dil, iterations=1)

def remove_horizontal_rules(gray: np.ndarray) -> np.ndarray:
    if gray.size == 0:
        return gray
    mask = _line_mask(gray, "h")
    if mask.sum() == 0:
        return gray
    return cv2.inpaint(gray, mask, 3, cv2.INPAINT_TELEA)

def remove_vertical_rules(gray: np.ndarray) -> np.ndarray:
    if gray.size == 0:
        return gray
    mask = _line_mask(gray, "v")
    if mask.sum() == 0:
        return gray
    return cv2.inpaint(gray, mask, 3, cv2.INPAINT_TELEA)

def remove_rules(gray: np.ndarray, vertical: bool = False) -> np.ndarray:
    out = remove_horizontal_rules(gray)
    if vertical:
        out = remove_vertical_rules(out)
    return out
