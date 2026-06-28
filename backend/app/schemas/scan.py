from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

EnhanceMode = Literal["original", "color", "gray", "bw", "magic"]
OcrEngine = Literal["pytesseract", "from_scratch"]

class ScanAssets(BaseModel):
    raw: Optional[str] = None
    enhanced: Optional[str] = None
    pdf: Optional[str] = None
    docx: Optional[str] = None

class ScanListItem(BaseModel):
    id: str
    name: str
    created_at: datetime
    bytes_size: int
    enhance_mode: EnhanceMode
    ocr_engine: OcrEngine = "pytesseract"
    mean_conf: float
    has_pdf: bool
    has_enhanced: bool
    has_docx: bool = False

    model_config = ConfigDict(from_attributes=True)

class ScanOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    original_filename: Optional[str]
    bytes_size: int

    enhance_mode: EnhanceMode
    ocr_engine: OcrEngine = "pytesseract"
    language: str

    mean_conf: float
    document_detected: bool
    detection_score: float
    confidence_warning: Optional[str]
    psm_used: int

    text: str
    enhanced_mime: Optional[str]

    quad: Optional[list[list[float]]] = None

    assets: ScanAssets

    model_config = ConfigDict(from_attributes=True)

class ScanCreateResponse(ScanOut):
    pass

class DetectResponse(BaseModel):

    document_detected: bool
    score: float

    quad: Optional[list[list[float]]] = None

    image_width: int
    image_height: int
