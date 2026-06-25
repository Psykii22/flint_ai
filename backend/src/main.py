from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from src.services.autopilot_routes import router as autopilot_router
app.include_router(autopilot_router)

from src.services.seed_data import router as seed_router
app.include_router(seed_router)

try:
    from src.services.investigator import router as investigator_router
    app.include_router(investigator_router)
except ImportError:
    pass

try:
    from src.services.k8s import router as k8s_router
    app.include_router(k8s_router)
except ImportError:
    pass
# The frontend is running separately in dev mode on port 3000
@app.get("/")
def project():
    return {"message": "ArcOps API is running. Please access the frontend at port 3000."}