"""
routes/analytics.py
---------------------
Read-only endpoint exposing the analytics accumulated for a session by
services/analytics_service.py. The frontend polls this to populate the
Analytics page's charts and stat cards; all figures come from real
recorded detections (see tracking_service.SessionState).
"""
from fastapi import APIRouter, Query

from services.analytics_service import get_session_analytics
from schemas.detection import AnalyticsResponse

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/{session_id}", response_model=AnalyticsResponse)
def analytics(session_id: str, current_face_count: int = Query(0, ge=0)):
    data = get_session_analytics(session_id, current_face_count)
    return AnalyticsResponse(**data)
