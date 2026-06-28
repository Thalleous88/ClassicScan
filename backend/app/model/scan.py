from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base

def _new_id() -> str:
    return str(uuid.uuid4())

class Scan(Base):
    __tablename__ = "scans"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_new_id)
    user_id = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    name = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=True)
    bytes_size = Column(Integer, nullable=False, default=0)

    enhance_mode = Column(String(32), nullable=False, default="color")
    ocr_engine = Column(String(32), nullable=False, default="pytesseract")

    mean_conf = Column(Float, nullable=False, default=0.0)
    document_detected = Column(Boolean, nullable=False, default=False)
    detection_score = Column(Float, nullable=False, default=0.0)
    confidence_warning = Column(String(512), nullable=True)
    psm_used = Column(Integer, nullable=False, default=0)
    language = Column(String(32), nullable=False, default="eng")

    text = Column(Text, nullable=False, default="")

    quad = Column(Text, nullable=True)

    raw_path = Column(String(1024), nullable=True)
    enhanced_path = Column(String(1024), nullable=True)
    enhanced_mime = Column(String(64), nullable=True)
    pdf_path = Column(String(1024), nullable=True)
    docx_path = Column(String(1024), nullable=True)

    user = relationship("User", backref="scans")
