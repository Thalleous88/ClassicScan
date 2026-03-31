from sqlalchemy import Column, Integer, String, DateTime, Enum
from app.db.database import Base
from sqlalchemy.sql import func
import enum

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"
    
class User(Base):
    __tablename__ = "users"
    user_id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.USER, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    