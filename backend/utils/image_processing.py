"""
utils/image_processing.py
--------------------------
Small, focused helpers for turning an uploaded frame into a validated
numpy/OpenCV image. Kept separate from route handlers and from the
detector service so each module has one job.
"""
import numpy as np
import cv2

import config


class InvalidImageError(ValueError):
    """Raised when uploaded data cannot be decoded or violates limits."""


def decode_image(raw_bytes: bytes) -> np.ndarray:
    """
    Decode raw image bytes (JPEG/PNG/WebP) into a BGR OpenCV frame.
    Raises InvalidImageError on anything that isn't a valid, reasonably
    sized image — never trusts client input.
    """
    if not raw_bytes:
        raise InvalidImageError("Empty image payload.")

    if len(raw_bytes) > config.MAX_UPLOAD_SIZE_BYTES:
        raise InvalidImageError(
            f"Image exceeds the {config.MAX_UPLOAD_SIZE_MB} MB upload limit."
        )

    np_buffer = np.frombuffer(raw_bytes, dtype=np.uint8)
    frame = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)

    if frame is None:
        raise InvalidImageError("Could not decode image data. Unsupported or corrupt file.")

    h, w = frame.shape[:2]
    if w == 0 or h == 0:
        raise InvalidImageError("Decoded image has zero width or height.")

    if max(w, h) > config.MAX_FRAME_DIMENSION:
        raise InvalidImageError(
            f"Frame dimension {w}x{h} exceeds the maximum allowed "
            f"({config.MAX_FRAME_DIMENSION}px). Lower the capture resolution."
        )

    return frame
