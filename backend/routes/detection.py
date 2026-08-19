"""
routes/detection.py
---------------------
POST /detect is the core of the application: the browser sends one video
frame (as a JPEG/PNG/WebP blob), the backend runs the real OpenCV DNN
face detector on it, tracks faces across calls, records analytics, and
returns structured JSON. No value in the response is fabricated —
confidence, box coordinates, processing time, and face count all come
directly from this call's actual detection.
"""
import time

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

import config
from services.detector_service import detector, ModelNotLoadedError
from services.tracking_service import session_manager
from utils.image_processing import decode_image, InvalidImageError
from schemas.detection import DetectionResponse, FaceBox

router = APIRouter(tags=["detection"])


@router.post("/detect", response_model=DetectionResponse)
async def detect_faces(
    image: UploadFile = File(..., description="A single video frame (JPEG/PNG/WebP)"),
    session_id: str = Form(..., description="Client-generated ID identifying this camera session"),
    confidence_threshold: float = Form(
        None, description="Optional override, 0.30-0.90. Falls back to the session's stored value."
    ),
):
    if image.content_type not in config.ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported content type '{image.content_type}'. "
                   f"Allowed: {', '.join(config.ALLOWED_IMAGE_CONTENT_TYPES)}.",
        )

    raw_bytes = await image.read()

    try:
        frame = decode_image(raw_bytes)
    except InvalidImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    state = session_manager.get(session_id)

    threshold = state.confidence_threshold
    if confidence_threshold is not None:
        if not (config.MIN_CONFIDENCE_THRESHOLD <= confidence_threshold <= config.MAX_CONFIDENCE_THRESHOLD):
            raise HTTPException(
                status_code=400,
                detail=f"confidence_threshold must be between {config.MIN_CONFIDENCE_THRESHOLD} "
                       f"and {config.MAX_CONFIDENCE_THRESHOLD}.",
            )
        threshold = confidence_threshold
        state.confidence_threshold = confidence_threshold

    request_start = time.perf_counter()
    try:
        result = detector.detect_faces(frame, threshold)
    except ModelNotLoadedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    tracked = state.tracker.update(result["detections"])
    total_processing_ms = (time.perf_counter() - request_start) * 1000.0

    state.record(tracked, total_processing_ms)

    faces = [
        FaceBox(
            id=det["id"],
            x=det["box"][0],
            y=det["box"][1],
            width=det["box"][2] - det["box"][0],
            height=det["box"][3] - det["box"][1],
            confidence=round(det["confidence"], 4),
        )
        for det in tracked
    ]

    return DetectionResponse(
        faces=faces,
        count=len(faces),
        processing_time_ms=round(total_processing_ms, 2),
        frame_width=result["frame_width"],
        frame_height=result["frame_height"],
        session_id=session_id,
    )
