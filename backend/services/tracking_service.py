"""
services/tracking_service.py
------------------------------
A lightweight, dependency-free IOU tracker (the same core idea as SORT,
minus the Kalman filter/Hungarian-algorithm machinery that isn't needed
for a single-camera, moderate-frame-rate use case). Each active browser
session gets its own tracker instance so multiple users don't share IDs.

Matching strategy: greedy IOU matching. For each new frame's detections,
match against existing tracks by highest IOU first. Unmatched detections
become new tracks with a new ID. Tracks that go unmatched for too many
consecutive frames are dropped, so IDs are reused rather than growing
without bound.
"""
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

import config


def _iou(box_a: Tuple[int, int, int, int], box_b: Tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    if inter_area == 0:
        return 0.0

    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    union = area_a + area_b - inter_area

    return inter_area / union if union > 0 else 0.0


@dataclass
class _Track:
    track_id: int
    box: Tuple[int, int, int, int]
    missed_frames: int = 0


class IOUTracker:
    """Assigns stable integer IDs to faces across successive frames."""

    def __init__(self, max_missed=None, iou_threshold=None):
        self.max_missed = max_missed if max_missed is not None else config.TRACKER_MAX_MISSED_FRAMES
        self.iou_threshold = iou_threshold if iou_threshold is not None else config.TRACKER_IOU_THRESHOLD
        self._tracks: Dict[int, _Track] = {}
        self._next_id = 1

    def update(self, detections: List[Dict]) -> List[Dict]:
        """
        detections: list of {"box": (x1,y1,x2,y2), "confidence": float}
        Returns the same detections, each with an added "id" key, in a
        stable order (matched tracks first, in ID order).
        """
        unmatched_detections = list(range(len(detections)))
        matched_pairs = []  # (track_id, detection_index)

        # Build all (iou, track_id, det_idx) candidates above threshold,
        # then greedily assign highest-IOU pairs first.
        candidates = []
        for track_id, track in self._tracks.items():
            for det_idx in unmatched_detections:
                score = _iou(track.box, detections[det_idx]["box"])
                if score >= self.iou_threshold:
                    candidates.append((score, track_id, det_idx))

        candidates.sort(key=lambda c: c[0], reverse=True)
        used_tracks = set()
        used_detections = set()

        for score, track_id, det_idx in candidates:
            if track_id in used_tracks or det_idx in used_detections:
                continue
            used_tracks.add(track_id)
            used_detections.add(det_idx)
            matched_pairs.append((track_id, det_idx))

        # Update matched tracks
        for track_id, det_idx in matched_pairs:
            self._tracks[track_id].box = detections[det_idx]["box"]
            self._tracks[track_id].missed_frames = 0
            detections[det_idx]["id"] = track_id

        # Age out unmatched tracks
        for track_id, track in list(self._tracks.items()):
            if track_id not in used_tracks:
                track.missed_frames += 1
                if track.missed_frames > self.max_missed:
                    del self._tracks[track_id]

        # Create new tracks for unmatched detections
        for det_idx, detection in enumerate(detections):
            if det_idx in used_detections:
                continue
            new_id = self._next_id
            self._next_id += 1
            self._tracks[new_id] = _Track(track_id=new_id, box=detection["box"])
            detection["id"] = new_id

        detections.sort(key=lambda d: d["id"])
        return detections


@dataclass
class SessionState:
    tracker: IOUTracker = field(default_factory=IOUTracker)
    frame_count: int = 0
    confidence_sum: float = 0.0
    confidence_samples: int = 0
    max_faces: int = 0
    latency_sum_ms: float = 0.0
    start_time: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    history: list = field(default_factory=list)  # bounded, see record()
    confidence_threshold: float = config.DEFAULT_CONFIDENCE_THRESHOLD

    def record(self, faces: List[Dict], latency_ms: float):
        self.frame_count += 1
        self.latency_sum_ms += latency_ms
        self.last_seen = time.time()

        face_count = len(faces)
        self.max_faces = max(self.max_faces, face_count)

        avg_conf_this_frame = 0.0
        if face_count:
            total = sum(f["confidence"] for f in faces)
            avg_conf_this_frame = total / face_count
            self.confidence_sum += total
            self.confidence_samples += face_count

        self.history.append({
            "timestamp": self.last_seen,
            "faces": face_count,
            "avg_confidence": avg_conf_this_frame,
        })
        if len(self.history) > config.ANALYTICS_HISTORY_MAXLEN:
            self.history.pop(0)

    def summary(self, current_face_count: int) -> Dict:
        elapsed = max(time.time() - self.start_time, 1e-6)
        return {
            "frames_processed": self.frame_count,
            "faces_detected_current": current_face_count,
            "average_confidence": (
                self.confidence_sum / self.confidence_samples if self.confidence_samples else 0.0
            ),
            "max_simultaneous_faces": self.max_faces,
            "average_fps": self.frame_count / elapsed,
            "average_latency_ms": (
                self.latency_sum_ms / self.frame_count if self.frame_count else 0.0
            ),
            "session_duration_seconds": elapsed,
            "history": self.history,
        }


class SessionManager:
    """
    Holds one SessionState per browser session (identified by a client-
    generated session_id). Idle sessions are cleaned up lazily so memory
    doesn't grow without bound over a long-running server process.
    """

    def __init__(self):
        self._sessions: Dict[str, SessionState] = {}
        self._lock = threading.Lock()

    def get(self, session_id: str) -> SessionState:
        with self._lock:
            self._cleanup_locked()
            if session_id not in self._sessions:
                self._sessions[session_id] = SessionState()
            return self._sessions[session_id]

    def reset(self, session_id: str):
        with self._lock:
            self._sessions.pop(session_id, None)

    def _cleanup_locked(self):
        now = time.time()
        stale = [
            sid for sid, state in self._sessions.items()
            if now - state.last_seen > config.SESSION_TTL_SECONDS
        ]
        for sid in stale:
            del self._sessions[sid]


# Module-level singleton, shared across requests/threads.
session_manager = SessionManager()
