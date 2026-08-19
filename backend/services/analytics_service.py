"""
services/analytics_service.py
-------------------------------
Turns a session's recorded detection history (tracking_service.SessionState)
into the AnalyticsResponse schema. Every number here is derived from
detections that actually happened — nothing is randomly generated.
"""
from typing import Dict

from services.tracking_service import session_manager


def get_session_analytics(session_id: str, current_face_count: int) -> Dict:
    state = session_manager.get(session_id)
    summary = state.summary(current_face_count)
    summary["session_id"] = session_id
    return summary
