"""
schemas/detection.py
---------------------
Pydantic models describing the API's request/response bodies. Keeping
these separate from the route handlers makes the API self-documenting
via FastAPI's automatic OpenAPI schema (/docs).
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class FaceBox(BaseModel):
    id: int = Field(..., description="Stable tracking ID for this face across frames")
    x: int = Field(..., description="Top-left X coordinate of the bounding box, in pixels")
    y: int = Field(..., description="Top-left Y coordinate of the bounding box, in pixels")
    width: int = Field(..., description="Bounding box width, in pixels")
    height: int = Field(..., description="Bounding box height, in pixels")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model confidence score, 0-1")


class DetectionResponse(BaseModel):
    faces: List[FaceBox]
    count: int
    processing_time_ms: float
    frame_width: int
    frame_height: int
    session_id: str


class HealthResponse(BaseModel):
    status: str
    model: str
    framework: str
    service: str
    model_loaded: bool


class DetectionSettings(BaseModel):
    confidence_threshold: float = Field(..., ge=0.30, le=0.90)


class DetectionSettingsUpdate(BaseModel):
    confidence_threshold: float = Field(..., ge=0.30, le=0.90)


class ModelInfo(BaseModel):
    model: str
    framework: str
    task: str
    input_size: str
    default_threshold: float
    status: str


class AnalyticsHistoryPoint(BaseModel):
    timestamp: float
    faces: int
    avg_confidence: float


class AnalyticsResponse(BaseModel):
    session_id: str
    frames_processed: int
    faces_detected_current: int
    average_confidence: float
    max_simultaneous_faces: int
    average_fps: float
    average_latency_ms: float
    session_duration_seconds: float
    history: List[AnalyticsHistoryPoint]


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
