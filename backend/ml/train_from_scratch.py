from __future__ import annotations

import logging
import platform
import random
import sys
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from . import ocr_from_scratch as fs

_log = logging.getLogger("train_from_scratch")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def _candidate_fonts() -> list[str]:
    sysname = platform.system().lower()
    if sysname == "windows":
        win = Path("C:/Windows/Fonts")
        return [
            str(win / name)
            for name in (
                "arial.ttf",
                "arialbd.ttf",
                "ariali.ttf",
                "times.ttf",
                "timesbd.ttf",
                "cour.ttf",
                "courbd.ttf",
                "verdana.ttf",
                "verdanab.ttf",
                "calibri.ttf",
                "calibrib.ttf",
                "georgia.ttf",
                "tahoma.ttf",
                "consola.ttf",
                "lucon.ttf",
                "trebuc.ttf",
            )
        ]
    if sysname == "darwin":
        roots = [Path("/Library/Fonts"), Path("/System/Library/Fonts")]
        names = [
            "Arial.ttf",
            "Arial Bold.ttf",
            "Times New Roman.ttf",
            "Courier New.ttf",
            "Verdana.ttf",
            "Helvetica.ttc",
        ]
        return [str(r / n) for r in roots for n in names]
    candidates: list[str] = []
    roots = [
        "/usr/share/fonts",
        "/usr/local/share/fonts",
        "/usr/share/fonts/truetype",
        "/usr/share/fonts/TTF",
    ]
    for r in roots:
        p = Path(r)
        if not p.exists():
            continue
        for ext in ("*.ttf", "*.TTF", "*.otf", "*.OTF"):
            candidates.extend(str(x) for x in p.rglob(ext))
    return candidates[:20]


def _load_fonts(sizes: list[int]) -> list[tuple]:
    from PIL import ImageFont

    out: list[tuple] = []
    paths = _candidate_fonts()
    for path in paths:
        if not Path(path).exists():
            continue
        for size in sizes:
            try:
                out.append((ImageFont.truetype(path, size=size), path, size))
            except Exception:
                continue
    if not out:
        from PIL import ImageFont as _IF

        out.append((_IF.load_default(), "default", 11))
        _log.warning("no truetype fonts found; using PIL default only")
    return out


def _render_glyph(char: str, font, size: int) -> Optional[np.ndarray]:
    """Render a single character on a white background, return cropped uint8."""
    from PIL import Image, ImageDraw

    canvas = Image.new("L", (size * 3, size * 3), color=255)
    draw = ImageDraw.Draw(canvas)
    try:
        bbox = draw.textbbox((0, 0), char, font=font)
    except Exception:
        bbox = (0, 0, size, size)
    w = max(1, bbox[2] - bbox[0])
    h = max(1, bbox[3] - bbox[1])
    pad = max(2, size // 6)
    canvas = Image.new("L", (w + pad * 2, h + pad * 2), color=255)
    draw = ImageDraw.Draw(canvas)
    try:
        draw.text((pad - bbox[0], pad - bbox[1]), char, font=font, fill=0)
    except Exception:
        return None
    arr = np.array(canvas, dtype=np.uint8)
    inv = cv2.bitwise_not(arr)
    if inv.sum() < 50:
        return None
    ys, xs = np.where(inv > 32)
    if ys.size == 0:
        return None
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    return inv[y0:y1, x0:x1]


def _augment(glyph: np.ndarray, rng: random.Random) -> np.ndarray:
    """Apply mild augmentations to simulate real captures."""
    img = glyph.copy()
    angle = rng.uniform(-3.5, 3.5)
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    img = cv2.warpAffine(img, M, (w, h), borderValue=0)
    op = rng.randint(0, 3)
    if op == 1:
        img = cv2.dilate(img, np.ones((2, 2), np.uint8), iterations=1)
    elif op == 2:
        img = cv2.erode(img, np.ones((2, 2), np.uint8), iterations=1)
    if rng.random() < 0.5:
        k = rng.choice([1, 3])
        if k > 1:
            img = cv2.GaussianBlur(img, (k, k), 0)
    if rng.random() < 0.3:
        noise = (rng.random() * 20)
        n = np.random.randint(0, int(noise) + 1, size=img.shape, dtype=np.uint8)
        img = cv2.subtract(img, n)
    _, img = cv2.threshold(img, 60, 255, cv2.THRESH_BINARY)
    return img


def build_dataset(
    sizes: Optional[list[int]] = None,
    augment_per_glyph: int = 6,
    seed: int = 0,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Render alphabet × fonts × sizes, augment, extract features."""
    sizes = sizes or [22, 28, 36, 44]
    rng = random.Random(seed)
    np.random.seed(seed)
    fonts = _load_fonts(sizes)
    _log.info("loaded %d (font, size) combinations", len(fonts))
    if not fonts:
        raise RuntimeError("no fonts available; cannot train")

    feats: list[np.ndarray] = []
    labels: list[str] = []
    rendered = 0
    skipped = 0
    started = time.time()
    for label in fs.ALPHABET:
        for font, _path, size in fonts:
            glyph = _render_glyph(label, font, size)
            if glyph is None:
                skipped += 1
                continue
            rendered += 1
            base_feat = fs.char_features(glyph)
            feats.append(base_feat)
            labels.append(label)
            for _ in range(augment_per_glyph):
                aug = _augment(glyph, rng)
                feats.append(fs.char_features(aug))
                labels.append(label)
    if not feats:
        raise RuntimeError("dataset empty after rendering; check font availability")

    X = np.stack(feats, axis=0).astype(np.float32)
    y = np.array(labels)
    _log.info(
        "dataset built: %d samples, %d classes (rendered %d glyphs, skipped %d) in %.1fs",
        len(y),
        len(set(labels)),
        rendered,
        skipped,
        time.time() - started,
    )
    return X, y, sorted(set(labels))


def train_and_save(
    out_path: Path = fs.MODEL_PATH,
    n_estimators: int = 180,
    seed: int = 0,
) -> dict:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    import joblib

    X, y, labels = build_dataset(seed=seed)
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, random_state=seed, stratify=y
    )
    _log.info("training RandomForest(n_estimators=%d)...", n_estimators)
    model = RandomForestClassifier(
        n_estimators=n_estimators,
        max_depth=None,
        min_samples_leaf=1,
        n_jobs=-1,
        random_state=seed,
        class_weight="balanced_subsample",
    )
    started = time.time()
    model.fit(X_tr, y_tr)
    train_secs = time.time() - started
    train_acc = model.score(X_tr, y_tr)
    val_acc = model.score(X_te, y_te)
    _log.info(
        "fit done in %.1fs; train_acc=%.3f val_acc=%.3f",
        train_secs,
        train_acc,
        val_acc,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    bundle = {
        "model": model,
        "labels": labels,
        "feature_dim": int(X.shape[1]),
        "trained_at": time.time(),
        "train_acc": float(train_acc),
        "val_acc": float(val_acc),
        "n_train": int(len(y_tr)),
        "n_val": int(len(y_te)),
    }
    joblib.dump(bundle, out_path, compress=3)
    _log.info("saved model to %s", out_path)
    return bundle


def main() -> int:
    try:
        train_and_save()
    except Exception:
        _log.exception("training failed")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
