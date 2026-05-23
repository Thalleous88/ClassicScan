from fastapi import FastAPI
from app.db.database import engine, Base
from app.routers import auth
import app.model.user  

app = FastAPI()
app.include_router(auth.router)

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    try:
        with engine.connect():
            print("DB connected")
    except Exception as e:
        print("DB failed:", e)

@app.get("/")
def read_root():
    server_port = os.getenv("PORT", "23000")
    return f"Server is listening on {server_port} :)"

    