"""
routes/settings.py
--------------------
Exposes/updates detection settings (confidence threshold) and static
model information. The threshold is tracked per session_id so multiple
concurrent browser tabs/users don't clobber each other's settings.

Note: POST /detect also accepts an inline confidence_threshold field for
every request (so the frontend's slider is reflected immediately without
a separate round trip); these endpoints exist for introspection and for
clients that want to set-and-forget.
"""
from fastapi import APIRouter, HTTPException, Query

import config
from services.detector_service import detector
from services.tracking_service import session_manager
from schemas.detection import DetectionSettings, DetectionSettingsUpdate, ModelInfo

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/model-info", response_model=ModelInfo)
def model_info():
    return ModelInfo(
        model=config.MODEL_NAME,
        framework=config.MODEL_FRAMEWORK,
        task="Face Detection",
        input_size=f"{config.DNN_INPUT_SIZE[0]} x {config.DNN_INPUT_SIZE[1]}",
        default_threshold=config.DEFAULT_CONFIDENCE_THRESHOLD,
        status="Loaded" if detector.is_loaded else "Not Loaded",
    )


@router.get("/detection", response_model=DetectionSettings)
def get_detection_settings(session_id: str = Query(...)):
    state = session_manager.get(session_id)
    return DetectionSettings(confidence_threshold=state.confidence_threshold)


@router.post("/detection", response_model=DetectionSettings)
def update_detection_settings(payload: DetectionSettingsUpdate, session_id: str = Query(...)):
    if not (config.MIN_CONFIDENCE_THRESHOLD <= payload.confidence_threshold <= config.MAX_CONFIDENCE_THRESHOLD):
        raise HTTPException(
            status_code=400,
            detail=f"confidence_threshold must be between {config.MIN_CONFIDENCE_THRESHOLD} "
                   f"and {config.MAX_CONFIDENCE_THRESHOLD}.",
        )
    state = session_manager.get(session_id)
    state.confidence_threshold = payload.confidence_threshold
    return DetectionSettings(confidence_threshold=state.confidence_threshold)
