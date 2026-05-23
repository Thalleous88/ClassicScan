from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta, timezone

from app.dependencies import get_db
from app.model.user import User
from app.schemas.user import UserCreate, UserOut, Token
from app.core.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

router = APIRouter(prefix="/auth", tags=["auth"])        # ← was missing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")  # ← was missing

def hashPassword(password: str) -> str:
    return pwd_context.hash(password)

def verifyPassword(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)

def createToken(userId: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": userId, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def signup(body: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        username=body.username,
        password_hash=hashPassword(body.password), 
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/signin", response_model=Token)
def signin(body: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verifyPassword(body.password, user.password_hash):  # ← fixed name
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = createToken(user.user_id)  # ← fixed name
    return {"access_token": token}