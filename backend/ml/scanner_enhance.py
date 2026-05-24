from __future__ import annotations

import cv2
import numpy as np

from . import _textstats, enhancer

MODES = ("original", "color", "gray", "bw", "magic")

def _shadow_free_lab(image_bgr: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
    L, A, B = cv2.split(lab)
    den = cv2.bilateralFilter(L, d=7, sigmaColor=50, sigmaSpace=50)
    th = max(_textstats.estimate_text_height(den), 8)
    k = max(15, th * 5)
    if k % 2 == 0:
        k += 1
    if k > 151:
        f = k / 151.0
        h, w = den.shape[:2]
        small = cv2.resize(den, (max(1, int(w / f)), max(1, int(h / f))), interpolation=cv2.INTER_AREA)
        bg_small = cv2.medianBlur(small, 151)
        bg = cv2.resize(bg_small, (w, h), interpolation=cv2.INTER_LINEAR)
    else:
        bg = cv2.medianBlur(den, k)
    norm = cv2.divide(den, bg, scale=255)
    L2 = cv2.normalize(norm, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    merged = cv2.merge([L2, A, B])
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)

def _white_balance(image_bgr: np.ndarray) -> np.ndarray:
    out = image_bgr.copy()
    for c in range(3):
        ch = out[:, :, c]
        lo, hi = np.percentile(ch, (2, 98))
        if hi - lo < 1:
            continue
        scaled = np.clip((ch.astype(np.float32) - lo) * (255.0 / (hi - lo)), 0, 255)
        out[:, :, c] = scaled.astype(np.uint8)
    return out

def _unsharp(image_bgr: np.ndarray, amount: float = 0.6) -> np.ndarray:
    blur = cv2.GaussianBlur(image_bgr, (0, 0), 1.2)
    sharp = cv2.addWeighted(image_bgr, 1.0 + amount, blur, -amount, 0)
    return np.clip(sharp, 0, 255).astype(np.uint8)

def _saturation_bump(image_bgr: np.ndarray, factor: float = 1.15) -> np.ndarray:
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * factor, 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

def _gamma(image_bgr: np.ndarray, gamma: float) -> np.ndarray:
    inv = 1.0 / max(gamma, 1e-6)
    table = np.array([((i / 255.0) ** inv) * 255 for i in range(256)]).astype(np.uint8)
    return cv2.LUT(image_bgr, table)

def _warm_shift(image_bgr: np.ndarray, b_scale: float = 0.95, r_scale: float = 1.05) -> np.ndarray:
    out = image_bgr.astype(np.float32)
    out[:, :, 0] = np.clip(out[:, :, 0] * b_scale, 0, 255)
    out[:, :, 2] = np.clip(out[:, :, 2] * r_scale, 0, 255)
    return out.astype(np.uint8)

def enhance(image_bgr: np.ndarray, mode: str = "color") -> np.ndarray:
    if mode not in MODES:
        raise ValueError(f"unknown enhance mode: {mode}")
    if mode == "original":
        return image_bgr
    if mode == "gray":
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        flat = enhancer._shadow_free_gray(gray)
        return cv2.cvtColor(flat, cv2.COLOR_GRAY2BGR)
    if mode == "bw":
        bin_gray = enhancer.binarized_path(image_bgr)
        return cv2.cvtColor(bin_gray, cv2.COLOR_GRAY2BGR)
    flat = _shadow_free_lab(image_bgr)
    flat = _white_balance(flat)
    flat = _unsharp(flat, amount=0.5)
    flat = _saturation_bump(flat, factor=1.10)
    if mode == "magic":
        flat = _gamma(flat, gamma=1.2)
        flat = _warm_shift(flat, b_scale=0.95, r_scale=1.05)
    return flat

def encode(image_bgr: np.ndarray, mode: str, quality: int = 88) -> tuple[bytes, str]:
    if mode == "bw":
        ok, buf = cv2.imencode(".png", image_bgr)
        if not ok:
            raise RuntimeError("png encode failed")
        return bytes(buf), "image/png"
    ok, buf = cv2.imencode(".jpg", image_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), int(max(40, min(100, quality)))])
    if not ok:
        raise RuntimeError("jpeg encode failed")
    return bytes(buf), "image/jpeg"
