from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np
from sklearn.cluster import KMeans

from . import _textstats, rules

DETECT_MAX_EDGE = 1500
SCORE_MIN = 0.25
SCORE_MIN_FRAMED = 0.18
LAPLACIAN_VAR_MIN = 50.0
INTERIOR_TEXT_CC_MIN = 5
CONTENT_FRACTION_MIN = 0.40

@dataclass
class Detection:
    quad: Optional[np.ndarray]
    score: float
    document_detected: bool
    debug: dict | None = None

def _resize_for_detection(image: np.ndarray) -> tuple[np.ndarray, float]:
    h, w = image.shape[:2]
    longest = max(h, w)
    if longest <= DETECT_MAX_EDGE:
        return image.copy(), 1.0
    scale = DETECT_MAX_EDGE / longest
    return cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA), scale

def _clahe(gray: np.ndarray) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(gray)

def _edges_canny(gray: np.ndarray, sigma: float = 0.25) -> np.ndarray:
    v = np.median(gray)
    lower = int(max(0, (1.0 - sigma) * v))
    upper = int(min(255, (1.0 + sigma) * v))
    return cv2.Canny(gray, lower, upper)

def _edges_sobel(gray: np.ndarray) -> np.ndarray:
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    mag = cv2.magnitude(gx, gy)
    mag = cv2.normalize(mag, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    _, th = cv2.threshold(mag, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return th

def _edges_tophat(gray: np.ndarray) -> np.ndarray:
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    tophat = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, k)
    return cv2.adaptiveThreshold(
        tophat, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 31, -5
    )

def _build_edge_map(gray: np.ndarray) -> np.ndarray:
    enhanced = _clahe(gray)
    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
    e1 = _edges_canny(blurred)
    e2 = _edges_sobel(blurred)
    e3 = _edges_tophat(enhanced)
    combined = cv2.bitwise_or(e1, cv2.bitwise_or(e2, e3))
    longest = max(gray.shape)
    k_size = max(3, longest // 300)
    if k_size % 2 == 0:
        k_size += 1
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (k_size, k_size))
    return cv2.morphologyEx(combined, cv2.MORPH_CLOSE, k, iterations=1)

def _order_quad(pts: np.ndarray) -> np.ndarray:
    pts = pts.reshape(4, 2).astype(np.float32)
    out = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    out[0] = pts[np.argmin(s)]
    out[2] = pts[np.argmax(s)]
    out[1] = pts[np.argmin(d)]
    out[3] = pts[np.argmax(d)]
    return out

def _interior_angles_ok(quad: np.ndarray, lo: float = 60.0, hi: float = 120.0) -> bool:
    pts = quad.reshape(4, 2)
    for i in range(4):
        a = pts[(i - 1) % 4] - pts[i]
        b = pts[(i + 1) % 4] - pts[i]
        cosang = np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)
        ang = np.degrees(np.arccos(np.clip(cosang, -1.0, 1.0)))
        if ang < lo or ang > hi:
            return False
    return True

def _aspect_ok(quad: np.ndarray) -> bool:
    p = _order_quad(quad)
    w = (np.linalg.norm(p[1] - p[0]) + np.linalg.norm(p[2] - p[3])) / 2
    h = (np.linalg.norm(p[3] - p[0]) + np.linalg.norm(p[2] - p[1])) / 2
    if w < 1 or h < 1:
        return False
    ratio = w / h
    return 0.4 <= ratio <= 2.6

def _interior_signals(gray: np.ndarray, quad: np.ndarray) -> tuple[float, int]:
    p = _order_quad(quad).astype(np.int32)
    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.fillPoly(mask, [p], 255)
    var = _textstats.laplacian_variance(gray, mask)
    cc = _textstats.count_text_components(gray, mask)
    return var, cc

def _score_quad(quad: np.ndarray, edges: np.ndarray, gray: np.ndarray) -> tuple[float, dict]:
    p = _order_quad(quad).astype(np.int32)
    h, w = edges.shape
    mask = np.zeros_like(edges)
    cv2.polylines(mask, [p], True, 255, thickness=3)
    edge_strength = float(np.count_nonzero(cv2.bitwise_and(edges, mask))) / max(
        1, np.count_nonzero(mask)
    )
    area = cv2.contourArea(p)
    area_ratio = area / float(h * w)
    cx, cy = p.mean(axis=0)
    cdist = np.hypot(cx - w / 2, cy - h / 2) / np.hypot(w / 2, h / 2)
    rect_score = 1.0 if _interior_angles_ok(quad) else 0.3
    var, cc = _interior_signals(gray, quad)
    text_density = min(1.0, cc / 20.0)
    score = (
        edge_strength * 0.30
        + area_ratio * 0.30
        + text_density * 0.20
        + rect_score * 0.10
        + (1 - cdist) * 0.10
    )
    sig = {
        "edge_strength": edge_strength,
        "area_ratio": area_ratio,
        "text_density": text_density,
        "lap_var": var,
        "text_cc": cc,
        "rect_score": rect_score,
        "centrality": 1 - cdist,
    }
    return score, sig

def _candidates_from_contours(edges: np.ndarray) -> list[np.ndarray]:
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]
    out: list[np.ndarray] = []
    h, w = edges.shape
    min_area = 0.05 * h * w
    for c in contours:
        if cv2.contourArea(c) < min_area:
            continue
        peri = cv2.arcLength(c, True)
        for eps in (0.02, 0.03, 0.04, 0.05):
            approx = cv2.approxPolyDP(c, eps * peri, True)
            if len(approx) == 4 and _aspect_ok(approx) and _interior_angles_ok(approx):
                out.append(approx.reshape(4, 2).astype(np.float32))
                break
    return out

def _line_intersection(l1, l2):
    x1, y1, x2, y2 = l1
    x3, y3, x4, y4 = l2
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-6:
        return None
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    return np.array([x1 + t * (x2 - x1), y1 + t * (y2 - y1)], dtype=np.float32)

def _candidates_from_hough(edges: np.ndarray) -> list[np.ndarray]:
    h, w = edges.shape
    min_len = int(0.2 * min(h, w))
    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180, threshold=80, minLineLength=min_len, maxLineGap=20
    )
    if lines is None or len(lines) < 4:
        return []
    lines = lines.reshape(-1, 4)
    angles = np.arctan2(lines[:, 3] - lines[:, 1], lines[:, 2] - lines[:, 0])
    feats = np.column_stack([np.cos(2 * angles), np.sin(2 * angles)])
    if len(feats) < 2:
        return []
    try:
        km = KMeans(n_clusters=2, n_init=4, random_state=0).fit(feats)
    except Exception:
        return []
    labels = km.labels_
    cluster_a = lines[labels == 0]
    cluster_b = lines[labels == 1]
    if len(cluster_a) < 2 or len(cluster_b) < 2:
        return []

    def _strongest(cluster, k=2):
        lengths = np.hypot(cluster[:, 2] - cluster[:, 0], cluster[:, 3] - cluster[:, 1])
        idx = np.argsort(-lengths)[:k]
        return cluster[idx]

    a = _strongest(cluster_a)
    b = _strongest(cluster_b)
    pts: list[np.ndarray] = []
    for la in a:
        for lb in b:
            p = _line_intersection(la, lb)
            if p is None:
                continue
            if 0 <= p[0] < w and 0 <= p[1] < h:
                pts.append(p)
    if len(pts) < 4:
        return []
    pts = np.array(pts, dtype=np.float32)
    if len(pts) > 4:
        pts = pts[np.argsort(np.hypot(pts[:, 0] - w / 2, pts[:, 1] - h / 2))[-4:]]
    if len(pts) != 4:
        return []
    quad = _order_quad(pts)
    if not (_aspect_ok(quad) and _interior_angles_ok(quad)):
        return []
    return [quad]

def _detect_by_content(gray: np.ndarray) -> Optional[np.ndarray]:
    h, w = gray.shape[:2]
    cleaned = rules.remove_horizontal_rules(gray)
    blur = cv2.GaussianBlur(cleaned, (3, 3), 0)
    _, bw = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    n, _, stats, _ = cv2.connectedComponentsWithStats(bw, connectivity=8)
    if n <= 1:
        return None
    keep_pts: list[tuple[int, int]] = []
    kept_components: list[tuple[int, int, int, int]] = []
    for i in range(1, n):
        ch = stats[i, cv2.CC_STAT_HEIGHT]
        cw = stats[i, cv2.CC_STAT_WIDTH]
        area = stats[i, cv2.CC_STAT_AREA]
        if ch < 6 or ch > h // 4:
            continue
        if cw < 2 or cw > w // 2:
            continue
        ar = cw / max(1, ch)
        if ar < 0.1 or ar > 8.0:
            continue
        if area < 12:
            continue
        x = stats[i, cv2.CC_STAT_LEFT]
        y = stats[i, cv2.CC_STAT_TOP]
        keep_pts.append((x, y))
        keep_pts.append((x + cw, y + ch))
        kept_components.append((int(x), int(y), int(cw), int(ch)))
    if len(keep_pts) < 20:
        return None
    pts = np.array(keep_pts, dtype=np.float32)
    rect = cv2.minAreaRect(pts)
    box = cv2.boxPoints(rect)
    cx, cy = rect[0]
    box = ((box - np.array([cx, cy], dtype=np.float32)) * 1.04 + np.array([cx, cy], dtype=np.float32)).astype(np.float32)
    box[:, 0] = np.clip(box[:, 0], 0, w - 1)
    box[:, 1] = np.clip(box[:, 1], 0, h - 1)
    area = cv2.contourArea(box.astype(np.float32))
    if area < 0.35 * h * w:
        return None

    box_int = box.astype(np.int32)
    box_path = box_int.reshape(-1, 1, 2)
    inside = 0
    for (cx_, cy_, cw_, ch_) in kept_components:
        center = (cx_ + cw_ / 2.0, cy_ + ch_ / 2.0)
        if cv2.pointPolygonTest(box_path, center, False) >= 0:
            inside += 1
    if inside / max(1, len(kept_components)) < CONTENT_FRACTION_MIN:
        return None
    return box.astype(np.float32)

def _refine_corners(gray: np.ndarray, quad: np.ndarray) -> np.ndarray:
    pts = quad.reshape(-1, 1, 2).astype(np.float32)
    try:
        cv2.cornerSubPix(
            gray,
            pts,
            (5, 5),
            (-1, -1),
            (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_COUNT, 30, 0.01),
        )
    except cv2.error:
        pass
    return pts.reshape(4, 2)

def _gradient_only_pass(gray: np.ndarray) -> list[np.ndarray]:
    enhanced = _clahe(gray)
    smoothed = cv2.bilateralFilter(enhanced, 7, 50, 50)
    edges = _edges_canny(smoothed, sigma=0.10)
    longest = max(gray.shape)
    k_size = max(3, longest // 350)
    if k_size % 2 == 0:
        k_size += 1
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (k_size, k_size))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, k, iterations=1)
    return _candidates_from_contours(closed)

def detect_document(image_bgr: np.ndarray) -> Detection:
    small, scale = _resize_for_detection(image_bgr)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    edges = _build_edge_map(gray)

    candidates = _candidates_from_contours(edges) + _candidates_from_hough(edges)
    scored: list[tuple[np.ndarray, float, dict]] = []
    for q in candidates:
        s, sig = _score_quad(q, edges, gray)
        if sig["lap_var"] < LAPLACIAN_VAR_MIN:
            continue
        if sig["text_cc"] < INTERIOR_TEXT_CC_MIN:
            continue
        scored.append((q, s, sig))

    debug = {"edge_candidates": len(candidates), "passed_gate": len(scored)}

    if scored:
        scored.sort(key=lambda kv: kv[1], reverse=True)
        best, best_score, best_sig = scored[0]

        framed = (
            best_sig["area_ratio"] > 0.85
            and best_sig["centrality"] > 0.85
            and best_sig["rect_score"] >= 1.0
        )
        threshold = SCORE_MIN_FRAMED if framed else SCORE_MIN
        if best_score >= threshold:
            refined = _refine_corners(gray, best)
            quad_full = refined / scale
            debug.update(
                {"chosen": "edge", "signals": best_sig, "framed": framed, "threshold": threshold}
            )
            return Detection(quad=quad_full, score=best_score, document_detected=True, debug=debug)

    grad_candidates = _gradient_only_pass(gray)
    grad_scored: list[tuple[np.ndarray, float, dict]] = []
    for q in grad_candidates:
        s, sig = _score_quad(q, edges, gray)
        if sig["area_ratio"] >= 0.45 and sig["rect_score"] >= 1.0:
            grad_scored.append((q, s, sig))
    if grad_scored:
        grad_scored.sort(key=lambda kv: kv[1], reverse=True)
        best, best_score, best_sig = grad_scored[0]
        refined = _refine_corners(gray, best)
        quad_full = refined / scale
        debug.update({"chosen": "gradient", "signals": best_sig, "score": best_score})
        return Detection(
            quad=quad_full,
            score=max(best_score, 0.30),
            document_detected=True,
            debug=debug,
        )

    fallback = _detect_by_content(gray)
    if fallback is not None:
        s, sig = _score_quad(fallback, edges, gray)
        if sig["text_cc"] >= INTERIOR_TEXT_CC_MIN:
            quad_full = fallback / scale
            debug.update({"chosen": "content", "signals": sig, "score": s})
            return Detection(quad=quad_full, score=max(s, 0.3), document_detected=True, debug=debug)

    debug["chosen"] = "none"
    return Detection(quad=None, score=0.0, document_detected=False, debug=debug)

def warp_to_document(image_bgr: np.ndarray, quad: np.ndarray) -> np.ndarray:
    pts = _order_quad(quad)
    tl, tr, br, bl = pts
    width = int(round(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl))))
    height = int(round(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl))))
    width = max(width, 100)
    height = max(height, 100)
    dst = np.array(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
        dtype=np.float32,
    )
    M = cv2.getPerspectiveTransform(pts, dst)
    return cv2.warpPerspective(image_bgr, M, (width, height), flags=cv2.INTER_CUBIC)

def normalize_dpi(warped_bgr: np.ndarray, target_x_height: int = 28) -> np.ndarray:
    gray = cv2.cvtColor(warped_bgr, cv2.COLOR_BGR2GRAY)
    th = _textstats.estimate_text_height(gray)
    if th <= 0:
        return warped_bgr
    scale = target_x_height / float(th)
    h, w = warped_bgr.shape[:2]
    if max(h, w) < 800:
        scale = max(scale, 1.0)
    scale = float(np.clip(scale, 0.8, 2.5))
    if abs(scale - 1.0) < 0.05:
        return warped_bgr
    interp = cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA
    return cv2.resize(warped_bgr, (int(w * scale), int(h * scale)), interpolation=interp)

def deskew(image_bgr: np.ndarray, max_angle: float = 5.0) -> np.ndarray:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    cleaned = rules.remove_horizontal_rules(gray)
    _, bw = cv2.threshold(cleaned, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    def _best_angle(rng: float, step: float) -> tuple[float, float]:
        best_a = 0.0
        best_v = -1.0
        for ang in np.arange(-rng, rng + step / 2, step):
            M = cv2.getRotationMatrix2D((bw.shape[1] / 2, bw.shape[0] / 2), ang, 1.0)
            rot = cv2.warpAffine(
                bw, M, (bw.shape[1], bw.shape[0]), flags=cv2.INTER_NEAREST, borderValue=0
            )
            proj = rot.sum(axis=1).astype(np.float32)
            v = float(np.var(proj))
            if v > best_v:
                best_v = v
                best_a = float(ang)
        return best_a, best_v

    angle, _ = _best_angle(max_angle, 0.25)
    if abs(angle) >= max_angle - 0.1:
        angle, _ = _best_angle(15.0, 0.5)
    if abs(angle) < 0.25:
        return image_bgr
    h, w = image_bgr.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(image_bgr, M, (w, h), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))

def auto_orient(image_bgr: np.ndarray, min_text_cc: int = 30, min_conf: float = 2.0) -> np.ndarray:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    if _textstats.count_text_components(gray) < min_text_cc:
        return image_bgr
    try:
        import pytesseract

        osd = pytesseract.image_to_osd(image_bgr, config="--psm 0")
        rot = 0
        conf = 0.0
        for line in osd.splitlines():
            if "Rotate:" in line:
                rot = int(line.split(":")[1].strip())
            elif "Orientation confidence" in line:
                try:
                    conf = float(line.split(":")[1].strip())
                except ValueError:
                    conf = 0.0
        if conf < min_conf:
            return image_bgr
        if rot == 90:
            return cv2.rotate(image_bgr, cv2.ROTATE_90_CLOCKWISE)
        if rot == 180:
            return cv2.rotate(image_bgr, cv2.ROTATE_180)
        if rot == 270:
            return cv2.rotate(image_bgr, cv2.ROTATE_90_COUNTERCLOCKWISE)
        return image_bgr
    except Exception:
        return image_bgr
