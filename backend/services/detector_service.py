"""
services/detector_service.py
------------------------------
This is the original project's `face_detector.py` logic, reused as-is
(same model files, same preprocessing, same DNN forward pass) and adapted
to a web-service context:

  * Loaded once as a singleton at startup instead of once per Tkinter app
    instance — the model is never reloaded per-request.
  * The confidence threshold is now a per-call parameter instead of a
    module-level constant, so the frontend's threshold slider actually
    changes detection behavior.
  * A lock guards `net.forward()` because FastAPI can run sync route
    handlers in a thread pool, and OpenCV's dnn.Net is not guaranteed
    safe for concurrent use from multiple threads.
"""
import os
import threading
import time
from typing import List, Dict

import cv2
import numpy as np

import config


class ModelNotLoadedError(RuntimeError):
    pass


class FaceDetector:
    """Thin wrapper around the OpenCV DNN SSD ResNet-10 face detector."""

    def __init__(self):
        self._net = None
        self._load_error = None
        self._lock = threading.Lock()
        self._load()

    def _load(self):
        if not os.path.exists(config.PROTOTXT_PATH) or not os.path.exists(config.MODEL_PATH):
            self._load_error = (
                "Face detection model files not found in backend/models/. "
                "Expected deploy.prototxt and res10_300x300_ssd_iter_140000.caffemodel."
            )
            return
        try:
            self._net = cv2.dnn.readNetFromCaffe(config.PROTOTXT_PATH, config.MODEL_PATH)
        except cv2.error as exc:
            self._load_error = f"Failed to load DNN model: {exc}"

    @property
    def is_loaded(self) -> bool:
        return self._net is not None

    @property
    def load_error(self):
        return self._load_error

    def detect_faces(self, frame: np.ndarray, confidence_threshold: float) -> Dict:
        """
        Run the SSD ResNet-10 face detector on a single BGR frame.

        Returns a dict with:
          - detections: list of {"box": (x1, y1, x2, y2), "confidence": float}
          - inference_time_ms: float, wall-clock time of the forward pass only
        """
        if self._net is None:
            raise ModelNotLoadedError(self._load_error or "Model is not loaded.")

        (h, w) = frame.shape[:2]
        blob = cv2.dnn.blobFromImage(
            cv2.resize(frame, config.DNN_INPUT_SIZE),
            1.0,
            config.DNN_INPUT_SIZE,
            config.DNN_MEAN_VALUES,
        )

        start = time.perf_counter()
        with self._lock:
            self._net.setInput(blob)
            raw_detections = self._net.forward()
        inference_time_ms = (time.perf_counter() - start) * 1000.0

        detections = []
        for i in range(raw_detections.shape[2]):
            confidence = float(raw_detections[0, 0, i, 2])
            if confidence < confidence_threshold:
                continue

            box = raw_detections[0, 0, i, 3:7] * np.array([w, h, w, h])
            (x1, y1, x2, y2) = box.astype("int")
            x1, y1 = max(0, int(x1)), max(0, int(y1))
            x2, y2 = min(w - 1, int(x2)), min(h - 1, int(y2))

            if x2 <= x1 or y2 <= y1:
                continue

            detections.append({"box": (x1, y1, x2, y2), "confidence": confidence})

        return {
            "detections": detections,
            "inference_time_ms": inference_time_ms,
            "frame_width": w,
            "frame_height": h,
        }


# Module-level singleton — created once at import time (app startup),
# reused for every request. Never reconstructed per-request.
detector = FaceDetector()
