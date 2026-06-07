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
                "arialbi.ttf",
                "times.ttf",
                "timesbd.ttf",
                "timesi.ttf",
                "cour.ttf",
                "courbd.ttf",
                "couri.ttf",
                "verdana.ttf",
                "verdanab.ttf",
                "verdanai.ttf",
                "calibri.ttf",
                "calibrib.ttf",
                "calibrii.ttf",
                "georgia.ttf",
                "georgiab.ttf",
                "georgiai.ttf",
                "tahoma.ttf",
                "tahomabd.ttf",
                "consola.ttf",
                "consolab.ttf",
                "consolai.ttf",
                "lucon.ttf",
                "trebuc.ttf",
                "trebucbd.ttf",
                "trebucit.ttf",
                "comic.ttf",
                "comicbd.ttf",
                "impact.ttf",
            )
        ]
    if sysname == "darwin":
        roots = [Path("/Library/Fonts"), Path("/System/Library/Fonts")]
        names = [
            "Arial.ttf",
            "Arial Bold.ttf",
            "Arial Italic.ttf",
            "Times New Roman.ttf",
            "Times New Roman Bold.ttf",
            "Courier New.ttf",
            "Courier New Bold.ttf",
            "Verdana.ttf",
            "Verdana Bold.ttf",
            "Helvetica.ttc",
            "Helvetica Bold.ttf",
            "Georgia.ttf",
            "Georgia Bold.ttf",
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
    return candidates[:30]


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
    img = glyph.copy()
    angle = rng.uniform(-4.0, 4.0)
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    img = cv2.warpAffine(img, M, (w, h), borderValue=0)

    op = rng.randint(0, 4)
    if op == 1:
        img = cv2.dilate(img, np.ones((2, 2), np.uint8), iterations=1)
    elif op == 2:
        img = cv2.erode(img, np.ones((2, 2), np.uint8), iterations=1)
    elif op == 3:
        k = rng.choice([2, 3])
        img = cv2.dilate(img, np.ones((k, 1), np.uint8), iterations=1)
    elif op == 4:
        k = rng.choice([2, 3])
        img = cv2.erode(img, np.ones((1, k), np.uint8), iterations=1)

    if rng.random() < 0.6:
        k = rng.choice([1, 3])
        if k > 1:
            img = cv2.GaussianBlur(img, (k, k), 0)

    if rng.random() < 0.4:
        noise = rng.random() * 25
        n = np.random.randint(0, int(noise) + 1, size=img.shape, dtype=np.uint8)
        img = cv2.subtract(img, n)

    if rng.random() < 0.2:
        shift_x = rng.randint(-2, 2)
        shift_y = rng.randint(-1, 1)
        M = np.float32([[1, 0, shift_x], [0, 1, shift_y]])
        img = cv2.warpAffine(img, M, (w, h), borderValue=0)

    if rng.random() < 0.15:
        scale = rng.uniform(0.85, 1.15)
        new_w = max(1, int(round(w * scale)))
        new_h = max(1, int(round(h * scale)))
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    _, img = cv2.threshold(img, 60, 255, cv2.THRESH_BINARY)
    return img


def _augment_break_strokes(glyph: np.ndarray, rng: random.Random) -> np.ndarray:
    img = _augment(glyph, rng)
    h, w = img.shape[:2]
    if rng.random() < 0.3 and h > 8 and w > 4:
        strip_y = rng.randint(h // 4, 3 * h // 4)
        strip_h = rng.randint(1, max(1, h // 10))
        strip_y2 = min(strip_y + strip_h, h)
        mask = np.ones_like(img)
        mask[strip_y:strip_y2, :] = 0
        img = (img * mask).astype(np.uint8)
    if rng.random() < 0.2 and h > 8 and w > 4:
        strip_x = rng.randint(w // 4, 3 * w // 4)
        strip_w = rng.randint(1, max(1, w // 10))
        strip_x2 = min(strip_x + strip_w, w)
        mask = np.ones_like(img)
        mask[:, strip_x:strip_x2] = 0
        img = (img * mask).astype(np.uint8)
    return img


def build_dataset(
    sizes: Optional[list[int]] = None,
    augment_per_glyph: int = 6,
    seed: int = 0,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    sizes = sizes or [20, 26, 32, 40, 48]
    rng = random.Random(seed)
    np.random.seed(seed)
    fonts = _load_fonts(sizes)
    _log.info("loaded %d (font, size) combinations", len(fonts))
    if not fonts:
        raise RuntimeError("no fonts available; cannot train")

    line_heights = [s * 1.5 for s in sizes]

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
            feats.append(fs.char_features(glyph, line_h=size * 1.5))
            labels.append(label)
            feats.append(fs.char_features(glyph))
            labels.append(label)

            for aug_idx in range(augment_per_glyph):
                if aug_idx < augment_per_glyph // 2:
                    aug = _augment(glyph, rng)
                else:
                    aug = _augment_break_strokes(glyph, rng)
                feats.append(fs.char_features(aug))
                labels.append(label)

                if rng.random() < 0.4:
                    lh = rng.choice(line_heights)
                    feats.append(fs.char_features(aug, line_h=lh))
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
    n_estimators: int = 200,
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
