from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

PipelineMode = Literal["auto", "printed", "handwriting"]
EnhanceMode = Literal["original", "color", "gray", "bw", "magic"]
PipelinePath = Literal["printed", "handwriting"]

class ScanAssets(BaseModel):
    raw: Optional[str] = None
    enhanced: Optional[str] = None
    pdf: Optional[str] = None

class ScanListItem(BaseModel):
    id: str
    name: str
    created_at: datetime
    bytes_size: int
    pipeline_path: PipelinePath
    enhance_mode: EnhanceMode
    handwriting_detected: bool
    mean_conf: float
    has_pdf: bool
    has_enhanced: bool

    model_config = ConfigDict(from_attributes=True)

class ScanOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    original_filename: Optional[str]
    bytes_size: int

    mode: str
    enhance_mode: EnhanceMode
    pipeline_path: PipelinePath
    language: str

    mean_conf: float
    document_detected: bool
    detection_score: float
    handwriting_detected: bool
    handwriting_confidence: float
    confidence_warning: Optional[str]
    psm_used: int

    text: str
    enhanced_mime: Optional[str]

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
