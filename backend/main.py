"""
main.py
--------
FastAPI application entrypoint for VisionAI's backend.

Run locally with:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

(from inside the backend/ directory, so the local `config`, `routes`, etc.
imports resolve — see the README for the full local-dev walkthrough.)
"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

import config
from routes import health, detection, settings, analytics

logging.basicConfig(level=logging.DEBUG if config.DEBUG else logging.INFO)
logger = logging.getLogger("visionai")

app = FastAPI(
    title="VisionAI Face Detection API",
    description="Real-time face detection backend powered by OpenCV DNN (SSD ResNet-10).",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    """Reject oversized bodies before they're fully read into memory."""
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > config.MAX_UPLOAD_SIZE_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={"error": "Payload too large", "detail": f"Max upload size is {config.MAX_UPLOAD_SIZE_MB} MB."},
                )
        except ValueError:
            pass
    return await call_next(request)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Friendly, structured error body — never a raw Python traceback.
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    detail = str(exc) if config.DEBUG else "An unexpected error occurred. Please try again."
    return JSONResponse(status_code=500, content={"error": "Internal server error", "detail": detail})


app.include_router(health.router)
app.include_router(detection.router)
app.include_router(settings.router)
app.include_router(analytics.router)


@app.on_event("startup")
async def on_startup():
    from services.detector_service import detector
    if detector.is_loaded:
        logger.info("Face detection model loaded successfully (%s).", config.MODEL_NAME)
    else:
        logger.error("Face detection model failed to load: %s", detector.load_error)
