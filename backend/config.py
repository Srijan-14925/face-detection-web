"""
config.py
----------
Central configuration for the backend service.

The DNN / model related constants are carried over unchanged from the
original Tkinter project's `config.py` so detection behavior is identical
to the desktop version. Everything else (CORS, upload limits, etc.) is new
and is read from environment variables so nothing is hardcoded.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Model / detection constants (carried over from the original desktop app)
# ---------------------------------------------------------------------------
PROTOTXT_PATH = str(BASE_DIR / "models" / "deploy.prototxt")
MODEL_PATH = str(BASE_DIR / "models" / "res10_300x300_ssd_iter_140000.caffemodel")

DNN_INPUT_SIZE = (300, 300)
DNN_MEAN_VALUES = (104.0, 177.0, 123.0)

# Default confidence threshold. The frontend can override this per-request
# and can also change the server-wide default via POST /settings/detection.
DEFAULT_CONFIDENCE_THRESHOLD = float(os.getenv("DEFAULT_CONFIDENCE_THRESHOLD", "0.5"))
MIN_CONFIDENCE_THRESHOLD = 0.30
MAX_CONFIDENCE_THRESHOLD = 0.90

# ---------------------------------------------------------------------------
# Server / web settings
# ---------------------------------------------------------------------------
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# Comma-separated list of allowed origins for CORS, e.g.
# "http://localhost:5500,https://your-frontend.vercel.app"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500").split(",")
    if origin.strip()
]

# Upload / request limits (security: RULE — validate frame data, limit size)
MAX_UPLOAD_SIZE_MB = float(os.getenv("MAX_UPLOAD_SIZE_MB", "8"))
MAX_UPLOAD_SIZE_BYTES = int(MAX_UPLOAD_SIZE_MB * 1024 * 1024)
ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}

# Maximum frame dimension accepted (frames larger than this are rejected
# rather than silently resized, so the client is told its capture settings
# are invalid instead of masking the problem).
MAX_FRAME_DIMENSION = int(os.getenv("MAX_FRAME_DIMENSION", "1920"))

# Tracking / session bookkeeping
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "600"))  # 10 minutes idle -> cleaned up
TRACKER_MAX_MISSED_FRAMES = int(os.getenv("TRACKER_MAX_MISSED_FRAMES", "15"))
TRACKER_IOU_THRESHOLD = float(os.getenv("TRACKER_IOU_THRESHOLD", "0.3"))

# Bounded history kept per session for the analytics time series
# (requirement: prevent unlimited history growth)
ANALYTICS_HISTORY_MAXLEN = int(os.getenv("ANALYTICS_HISTORY_MAXLEN", "300"))

MODEL_NAME = "SSD ResNet-10"
MODEL_FRAMEWORK = "OpenCV DNN"
