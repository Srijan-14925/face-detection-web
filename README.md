# VisionAI — Real-Time Face Detection System

A production-oriented web application that replaces the original Tkinter
desktop face-detection app with a browser frontend + FastAPI backend,
built around the **same OpenCV DNN SSD ResNet-10 detector** the desktop
app used.

---

## 1. Project Overview

The browser owns the webcam (via `getUserMedia`), captures frames, and
sends them to a Python/FastAPI backend, which runs the real OpenCV DNN
face detector and returns structured JSON (boxes, confidence, tracked
IDs, timing). The frontend draws the results on a `<canvas>` overlaid on
the video, and provides a full dashboard: live metrics, analytics
charts, detection history, snapshots, privacy blur, and settings.

No detection result, FPS number, latency figure, or analytics stat is
hardcoded or randomly generated — everything shown in the UI is derived
from a real backend response.

## 2. Architecture

```
Browser (getUserMedia)
   │  captures frames
   ▼
Frontend (HTML/CSS/JS, Canvas overlay)
   │  POST /detect (multipart JPEG frame)
   ▼
FastAPI backend
   │  OpenCV DNN (SSD ResNet-10) — services/detector_service.py
   │  IOU face tracker           — services/tracking_service.py
   │  per-session analytics      — services/analytics_service.py
   ▼
JSON response (faces, count, processing_time_ms, ...)
   ▼
Canvas overlay renders boxes / labels / privacy blur
```

The backend never touches a webcam directly — it only ever processes
frames the browser sends it. This is what makes it deployable to any
standard Python host (it doesn't need a physical camera attached).

## 3. Features

- Live browser webcam streaming with start/stop control
- Real OpenCV DNN face detection (SSD ResNet-10, same model as the
  original desktop app)
- Configurable confidence threshold (30%–90%), applied live
- Lightweight IOU-based face tracking with stable per-face IDs
- Real-time metrics: face count, average confidence, FPS, latency,
  session duration, frames processed
- Performance monitor: inference / network / render / total timing
- Snapshot capture (downloads the annotated frame + logs it to History)
- Detection history (persisted for the browser tab's session)
- Analytics page with live charts (Chart.js) sourced from the backend's
  real per-session statistics
- Privacy blur (client-side canvas blur over detected face regions)
- Fullscreen camera view
- Camera / resolution / processing-FPS selection
- Responsive layout (desktop, tablet, mobile) with a collapsible sidebar
- Friendly error handling for camera/backend/model failures — no raw
  stack traces ever reach the browser

## 4. Requirements

- Python 3.9+
- A webcam-capable browser (Chrome, Edge, or Firefox recommended)
- The two model files already included in `backend/models/`:
  `deploy.prototxt` and `res10_300x300_ssd_iter_140000.caffemodel`

## 5. Installation

```bash
git clone <your-repo-url>
cd face-detection-web
```

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # then edit ALLOWED_ORIGINS etc. as needed
```

### Frontend

No build step — it's plain HTML/CSS/JS. You only need a static file
server (opening `index.html` directly via `file://` will break camera
permissions in some browsers, so use a local server).

## 6. Local Development

**1. Start the backend** (from `backend/`):

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Verify it's up:

```bash
curl http://localhost:8000/health
```

You should see `{"status":"online","model":"SSD ResNet-10",...}`.
Interactive API docs are at `http://localhost:8000/docs`.

**2. Start the frontend** (from `frontend/`), using any static server, e.g.:

```bash
python -m http.server 5500
# or: npx serve -l 5500
```

Then open `http://localhost:5500` in your browser.

**3. Configure the backend URL the frontend talks to** — see
`frontend/js/config.js`. It defaults to `http://localhost:8000` when the
page itself is served from `localhost`/`127.0.0.1`, so local development
works out of the box as long as the backend is on port 8000. To point at
a different backend, set `window.__VISIONAI_API_URL__` before
`config.js` loads (e.g. add a small inline `<script>` in `index.html`,
or template it in at build/deploy time).

**Camera permissions on localhost:** browsers treat `http://localhost`
(and `http://127.0.0.1`) as a secure context, so camera access works
without HTTPS during local development. Anywhere else, you need HTTPS.

## 7. Environment Variables

Backend (`backend/.env`, see `backend/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8000` | Bind port |
| `DEBUG` | `false` | Include real error detail in 500 responses |
| `ALLOWED_ORIGINS` | `http://localhost:5500,http://127.0.0.1:5500` | Comma-separated CORS allow-list |
| `DEFAULT_CONFIDENCE_THRESHOLD` | `0.5` | Default detector threshold |
| `MAX_UPLOAD_SIZE_MB` | `8` | Reject frames larger than this |
| `MAX_FRAME_DIMENSION` | `1920` | Reject frames wider/taller than this |
| `SESSION_TTL_SECONDS` | `600` | Idle session cleanup interval |
| `TRACKER_MAX_MISSED_FRAMES` | `15` | Frames a track survives without a match |
| `TRACKER_IOU_THRESHOLD` | `0.3` | Minimum IOU to keep a track's ID |
| `ANALYTICS_HISTORY_MAXLEN` | `300` | Bounded chart history points per session |

Frontend (`frontend/js/config.js`):

| Value | Purpose |
|---|---|
| `window.__VISIONAI_API_URL__` | The deployed backend's base URL (e.g. `https://visionai-backend.onrender.com`) |

## 8. Backend Deployment

Vercel's serverless functions are not a good fit for a long-running
OpenCV DNN process, so deploy the backend to a platform that runs a
persistent Python process — e.g. **Render**, **Railway**, **Fly.io**, or
a plain VM/container host. An example Render config is in
`deployment/render.yaml`; adapt the equivalent settings for your host of
choice:

- Root directory: `backend/`
- Build: `pip install -r requirements.txt`
- Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Set `ALLOWED_ORIGINS` to your deployed frontend's URL

## 9. Frontend Deployment

The frontend is static, so **Vercel** works well (`vercel.json` at the
repo root points Vercel at the `frontend/` directory). Before deploying,
set the backend URL for production — the simplest approach is adding one
line to `frontend/index.html`, right before the `config.js` `<script>`
tag:

```html
<script>window.__VISIONAI_API_URL__ = "https://your-backend-host.example.com";</script>
```

## 10. CORS Configuration

The backend only accepts cross-origin requests from origins listed in
`ALLOWED_ORIGINS` (see `backend/config.py` / `backend/main.py`). Add
every origin the frontend will actually be served from (including both
`http://localhost:5500`-style local dev URLs and your production domain)
— requests from anywhere else are rejected by the browser via CORS.

## 11. Camera Permissions

- The browser — not the backend — requests camera permission via
  `getUserMedia`. The user must explicitly allow it.
- Camera access requires a **secure context**: `https://` in production,
  or `http://localhost` / `http://127.0.0.1` for local development.
- If permission is denied, the UI shows a specific, friendly message
  rather than failing silently (see `frontend/js/camera.js`).

## 12. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Status badge shows "Offline" | Backend isn't running, or `ALLOWED_ORIGINS` doesn't include the frontend's origin (check the browser console for a CORS error) |
| "Camera permission denied" | Grant camera access in the browser's site settings and reload |
| "The camera is unavailable" | Another app (Zoom, Teams, etc.) is using the camera, or no camera is present |
| Model status shows "Not Loaded" | `backend/models/deploy.prototxt` and `.caffemodel` are missing — confirm both files exist |
| Detection requests fail with 415 | The captured frame's content type wasn't JPEG/PNG/WebP (shouldn't happen with the default frontend, but relevant if you build a custom client) |
| Detection requests fail with 413 | Frame exceeds `MAX_UPLOAD_SIZE_MB` — lower the resolution setting |
| Boxes are misaligned from faces | Usually a stale canvas size after a resolution change — the overlay resyncs to the video's native resolution on every frame, so this should self-correct within a frame or two |

## 13. Project Structure

```
face-detection-web/
├── backend/
│   ├── main.py                  FastAPI app, CORS, error handling
│   ├── config.py                All configuration (env-driven)
│   ├── requirements.txt
│   ├── .env.example
│   ├── routes/
│   │   ├── detection.py         POST /detect
│   │   ├── health.py            GET /, GET /health
│   │   ├── settings.py          GET/POST /settings/detection, /settings/model-info
│   │   └── analytics.py         GET /analytics/{session_id}
│   ├── services/
│   │   ├── detector_service.py  OpenCV DNN wrapper (ported from the original face_detector.py)
│   │   ├── tracking_service.py  IOU tracker + per-session state
│   │   └── analytics_service.py Builds analytics responses from real session data
│   ├── schemas/
│   │   └── detection.py         Pydantic request/response models
│   ├── utils/
│   │   └── image_processing.py  Frame decode/validation
│   └── models/
│       ├── deploy.prototxt
│       └── res10_300x300_ssd_iter_140000.caffemodel
│
├── frontend/
│   ├── index.html
│   ├── css/
│   │   ├── style.css
│   │   └── responsive.css
│   └── js/
│       ├── config.js            API base URL / session ID
│       ├── camera.js            getUserMedia wrapper
│       ├── canvas.js            Overlay rendering + privacy blur
│       ├── detection.js         Frame capture + POST /detect loop
│       ├── analytics.js         Analytics page + Chart.js
│       ├── settings.js          Settings page state
│       └── app.js               Bootstraps everything, page nav, history, snapshots
│
├── deployment/
│   └── render.yaml              Example backend deployment config
├── vercel.json                  Frontend static deployment config
├── requirements.txt
├── .gitignore
└── README.md
```

## 14. API Documentation

Interactive OpenAPI docs are auto-generated by FastAPI at `/docs` and
`/redoc` once the backend is running. Summary:

### `GET /health`
```json
{"status": "online", "model": "SSD ResNet-10", "framework": "OpenCV DNN", "service": "face-detection", "model_loaded": true}
```

### `POST /detect`
Multipart form data:
- `image` (file, required) — a JPEG/PNG/WebP frame
- `session_id` (string, required) — client-generated session identifier
- `confidence_threshold` (float, optional, 0.30–0.90)

```json
{
  "faces": [
    {"id": 1, "x": 120, "y": 80, "width": 160, "height": 190, "confidence": 0.974}
  ],
  "count": 1,
  "processing_time_ms": 31.4,
  "frame_width": 1280,
  "frame_height": 720,
  "session_id": "..."
}
```

### `GET /settings/model-info`
Returns model name, framework, task, input size, default threshold, and
load status.

### `GET /settings/detection?session_id=...` / `POST /settings/detection?session_id=...`
Read or update the confidence threshold for a session.

### `GET /analytics/{session_id}?current_face_count=N`
Returns frames processed, average confidence, max simultaneous faces,
average FPS, average latency, session duration, and a bounded time
series for the charts.

---

## Known Limitations

- **Frames reach the server unblurred.** Privacy blur is applied on the
  canvas the user sees (and on downloaded snapshots), but the raw frame
  still has to reach the backend for detection to run at all — that's
  inherent to a server-side-inference architecture. The backend does
  not persist or forward frames anywhere; each one is decoded, used for
  one detection call, and discarded.
- **Tracking is IOU-based, not Kalman/DeepSORT.** It works well for a
  single camera at moderate motion, but fast-moving or heavily
  overlapping faces can occasionally swap IDs.
- **Analytics/session state is in-memory** on the backend (per
  `session_id`, cleaned up after `SESSION_TTL_SECONDS` of inactivity).
  Restarting the backend clears all sessions — there's no database.
- **History/snapshots live in `sessionStorage`,** scoped to one browser
  tab; they don't sync across devices or persist after the tab is
  closed.
- Camera device enumeration only returns friendly labels after the user
  has granted permission at least once (a browser limitation, not
  something this app can work around).

## Recommended Next Improvements

- Move session/analytics state to Redis or a small database for
  multi-instance backend deployments (the current in-memory
  `SessionManager` assumes a single backend process).
- Add face landmarks / head pose (V3) once the V1/V2 baseline has been
  validated in production.
- Consider WebSocket streaming instead of polling `POST /detect` if a
  higher sustained FPS is needed than HTTP round-trips comfortably
  support.
- Add automated tests (pytest for the backend; a headless-browser smoke
  test for the frontend's camera → detect → render pipeline).
