from pydantic import BaseModel, Field, ConfigDict
from datetime import date
from typing import Optional

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
    created_date: date
    
    model = ConfigDict(from_attributes=True)