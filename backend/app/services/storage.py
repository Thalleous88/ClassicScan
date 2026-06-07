from __future__ import annotations

import shutil
from pathlib import Path
from typing import Literal

from app.core.config import get_settings

AssetKind = Literal["raw", "enhanced", "pdf", "docx"]
_ASSET_FILENAMES: dict[str, dict[str, str]] = {
    "raw": {"image/jpeg": "raw.jpg", "image/png": "raw.png"},
    "enhanced": {"image/jpeg": "enhanced.jpg", "image/png": "enhanced.png"},
    "pdf": {"application/pdf": "scan.pdf"},
    "docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "scan.docx",
    },
}

def _root() -> Path:
    return get_settings().storage_dir_path

def scan_dir(user_id: int, scan_id: str) -> Path:
    p = _root() / str(user_id) / scan_id
    return p

def _filename_for(kind: AssetKind, mime: str) -> str:
    table = _ASSET_FILENAMES.get(kind, {})
    if mime in table:
        return table[mime]
    if kind == "raw":
        return "raw.jpg"
    if kind == "enhanced":
        return "enhanced.jpg"
    if kind == "docx":
        return "scan.docx"
    return "scan.pdf"

def save_bytes(user_id: int, scan_id: str, kind: AssetKind, mime: str, data: bytes) -> str:
    d = scan_dir(user_id, scan_id)
    d.mkdir(parents=True, exist_ok=True)
    name = _filename_for(kind, mime)
    p = (d / name).resolve()

    if not str(p).startswith(str(d.resolve())):
        raise ValueError("invalid storage path")
    with open(p, "wb") as fh:
        fh.write(data)
    return str(p)

def read_bytes(path: str) -> bytes:
    p = Path(path).resolve()
    root = _root().resolve()

    try:
        p.relative_to(root)
    except ValueError as e:
        raise PermissionError("path is outside storage root") from e
    with open(p, "rb") as fh:
        return fh.read()

def delete_scan_dir(user_id: int, scan_id: str) -> None:
    d = scan_dir(user_id, scan_id)
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)
