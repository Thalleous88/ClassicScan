from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pytesseract
from dotenv import load_dotenv
from pytesseract import Output

load_dotenv()

_TESS = os.getenv("TESSERACT_PATH")
if _TESS:
    pytesseract.pytesseract.tesseract_cmd = _TESS

DEFAULT_LANG = os.getenv("OCR_LANG", "eng")

_log = logging.getLogger(__name__)

def _list_installed_langs() -> set[str]:
    cmd = pytesseract.pytesseract.tesseract_cmd or "tesseract"
    try:
        import subprocess

        out = subprocess.run(
            [cmd, "--list-langs"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception:
        return set()
    langs: set[str] = set()
    for line in out.stdout.splitlines():
        s = line.strip()
        if not s or " " in s or s.lower().startswith("list of"):
            continue
        langs.add(s)
    return langs

_AVAILABLE_LANGS = _list_installed_langs()

_HANDWRITING_AUX_LANG: str | None = None
for _cand in ("eng_handwriting", "Latin", "script/Latin"):
    if _cand in _AVAILABLE_LANGS:
        _HANDWRITING_AUX_LANG = _cand
        break

_HAS_HANDWRITING_MODEL = _HANDWRITING_AUX_LANG is not None
if not _HAS_HANDWRITING_MODEL:
    _log.warning("no handwriting/Latin script model found; handwriting branch will use eng only")
else:
    _log.info("handwriting branch will also try lang=%s", _HANDWRITING_AUX_LANG)

@dataclass
class Word:
    text: str
    conf: float
    bbox: tuple[int, int, int, int]
    block_num: int
    par_num: int
    line_num: int

@dataclass
class OcrPass:
    psm: int
    lang: str
    image_kind: str
    text: str
    mean_conf: float
    words: list[Word] = field(default_factory=list)

def _run_tesseract(image: np.ndarray, psm: int, lang: str, image_kind: str = "") -> OcrPass:
    config = f"--oem 3 --psm {psm}"
    try:
        data = pytesseract.image_to_data(image, lang=lang, config=config, output_type=Output.DICT)
    except pytesseract.TesseractError as e:
        _log.warning("tesseract failed psm=%d lang=%s: %s", psm, lang, e)
        return OcrPass(psm=psm, lang=lang, image_kind=image_kind, text="", mean_conf=0.0)
    words: list[Word] = []
    for i in range(len(data["text"])):
        txt = (data["text"][i] or "").strip()
        if not txt:
            continue
        try:
            conf = float(data["conf"][i])
        except (TypeError, ValueError):
            conf = 0.0
        if conf < 0:
            conf = 0.0
        words.append(
            Word(
                text=txt,
                conf=conf,
                bbox=(
                    int(data["left"][i]),
                    int(data["top"][i]),
                    int(data["width"][i]),
                    int(data["height"][i]),
                ),
                block_num=int(data["block_num"][i]),
                par_num=int(data["par_num"][i]),
                line_num=int(data["line_num"][i]),
            )
        )
    text = _reflow(words)
    confs = [w.conf for w in words if w.conf > 0]
    mean = float(np.mean(confs)) if confs else 0.0
    return OcrPass(psm=psm, lang=lang, image_kind=image_kind, text=text, mean_conf=mean, words=words)

def _reflow(words: list[Word]) -> str:
    if not words:
        return ""
    grouped: dict[tuple[int, int, int], list[Word]] = {}
    for w in words:
        grouped.setdefault((w.block_num, w.par_num, w.line_num), []).append(w)
    paragraphs: list[list[str]] = []
    current: list[str] = []
    last_block_par: Optional[tuple[int, int]] = None
    for key in sorted(grouped.keys()):
        bp = (key[0], key[1])
        line_words = sorted(grouped[key], key=lambda w: w.bbox[0])
        line_text = " ".join(w.text for w in line_words)
        if last_block_par is not None and bp != last_block_par and current:
            paragraphs.append(current)
            current = []
        current.append(line_text)
        last_block_par = bp
    if current:
        paragraphs.append(current)
    return "\n\n".join("\n".join(p) for p in paragraphs)

def _bbox_iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix0, iy0 = max(ax, bx), max(ay, by)
    ix1, iy1 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    union = aw * ah + bw * bh - inter
    return inter / max(1, union)

def _merge_passes(passes: list[OcrPass]) -> OcrPass:
    if not passes:
        return OcrPass(psm=0, lang="", image_kind="", text="", mean_conf=0.0)
    base = max(passes, key=lambda p: (p.mean_conf, len(p.words)))
    merged_words: list[Word] = list(base.words)
    for p in passes:
        if p is base:
            continue
        for w in p.words:
            overlapping = False
            for existing in merged_words:
                if _bbox_iou(w.bbox, existing.bbox) > 0.4:
                    overlapping = True
                    if w.conf > existing.conf:
                        merged_words[merged_words.index(existing)] = w
                    break
            if not overlapping:
                merged_words.append(w)
    text = _reflow(merged_words)
    confs = [w.conf for w in merged_words if w.conf > 0]
    mean = float(np.mean(confs)) if confs else 0.0
    return OcrPass(
        psm=base.psm,
        lang=base.lang,
        image_kind="merged",
        text=text,
        mean_conf=mean,
        words=merged_words,
    )

def _spell_correct(text: str, words: list[Word]) -> str:
    try:
        from symspellpy import SymSpell, Verbosity
        from importlib.resources import files as resource_files
    except Exception:
        return text
    try:
        sym = SymSpell(max_dictionary_edit_distance=2, prefix_length=7)
        dict_path = str(resource_files("symspellpy") / "frequency_dictionary_en_82_765.txt")
        if not sym.load_dictionary(dict_path, term_index=0, count_index=1):
            return text
    except Exception:
        return text
    high_conf = {w.text for w in words if w.conf >= 85}
    out_tokens: list[str] = []
    for tok in text.split(" "):
        stripped = tok.strip(".,;:!?\"'()[]{}")
        if not stripped or stripped in high_conf or any(ch.isdigit() for ch in stripped):
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

def run_printed(
    images: dict[str, np.ndarray],
    lang: str = DEFAULT_LANG,
    spell_check: bool = True,
) -> tuple[OcrPass, list[OcrPass]]:
    alternatives: list[OcrPass] = []
    p1 = _run_tesseract(images["gray"], psm=6, lang=lang, image_kind="grayscale")
    alternatives.append(p1)
    p2 = _run_tesseract(images["binary"], psm=4, lang=lang, image_kind="binary")
    alternatives.append(p2)
    best = p1 if p1.mean_conf >= p2.mean_conf else p2
    if best.mean_conf < 60:
        p3 = _run_tesseract(images["gray"], psm=11, lang=lang, image_kind="grayscale")
        alternatives.append(p3)
        if p3.mean_conf > best.mean_conf:
            best = p3
    if (not best.words) and "raw" in images:
        p4 = _run_tesseract(images["raw"], psm=6, lang=lang, image_kind="raw")
        alternatives.append(p4)
        if p4.mean_conf > best.mean_conf or (p4.words and not best.words):
            best = p4
    if spell_check and best.text:
        best.text = _spell_correct(best.text, best.words)
    return best, alternatives

def run_handwriting(
    images: dict[str, np.ndarray],
    spell_check: bool = False,
) -> tuple[OcrPass, list[OcrPass]]:
    img = images["handwriting_gray"]
    alternatives: list[OcrPass] = []
    runs: list[OcrPass] = []
    for psm in (6, 7, 11):
        p = _run_tesseract(img, psm=psm, lang="eng", image_kind="handwriting_gray")
        alternatives.append(p)
        runs.append(p)
    if _HAS_HANDWRITING_MODEL and _HANDWRITING_AUX_LANG:
        ph = _run_tesseract(img, psm=6, lang=_HANDWRITING_AUX_LANG, image_kind="handwriting_gray")
        alternatives.append(ph)
        runs.append(ph)
    merged = _merge_passes(runs)
    if (not merged.words) and "raw" in images:
        praw = _run_tesseract(images["raw"], psm=6, lang="eng", image_kind="raw")
        alternatives.append(praw)
        if praw.words:
            merged = praw
    if spell_check and merged.text:
        merged.text = _spell_correct(merged.text, merged.words)
    return merged, alternatives

def has_handwriting_model() -> bool:
    return _HAS_HANDWRITING_MODEL
