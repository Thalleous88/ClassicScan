from fastapi import FastAPI
from app.db.database import engine

app = FastAPI()

@app.get("/")
def read_root():
    return "Hello World"

@app.on_event("startup")
def test_db_connection():
    try:
        with engine.connect():
            print("DB connected")
    except Exception as e:
        print("DB failed:", e)
