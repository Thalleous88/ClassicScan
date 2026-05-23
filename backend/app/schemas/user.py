from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional
from app.model.enums import UserRole  
class UserBase(BaseModel):
    username: str
    role: str = "user"
    
class UserCreate(UserBase):
    password: str
    
class UserUpdate(UserBase):
    username: Optional[str] = Field(None, min_length=3)
    password: Optional[str] = Field(None, min_length=8)
    role: Optional[str] = None
    
class UserOut(UserBase):
    user_id: int
    username: str
    role: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
    
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"