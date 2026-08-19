"""
routes/health.py
------------------
Basic liveness/info endpoints. Used by the frontend to show the
ONLINE / OFFLINE status indicator and by the model-info panel.
"""
from fastapi import APIRouter

import config
from services.detector_service import detector
from schemas.detection import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/", response_model=HealthResponse)
def root():
    return HealthResponse(
        status="online",
        model=config.MODEL_NAME,
        framework=config.MODEL_FRAMEWORK,
        service="VisionAI Face Detection API",
        model_loaded=detector.is_loaded,
    )


@router.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="online" if detector.is_loaded else "degraded",
        model=config.MODEL_NAME,
        framework=config.MODEL_FRAMEWORK,
        service="face-detection",
        model_loaded=detector.is_loaded,
    )
