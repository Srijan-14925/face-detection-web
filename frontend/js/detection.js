/**
 * detection.js
 * -------------
 * Captures frames from the live <video> element and POSTs them to the
 * FastAPI backend's /detect endpoint. This is the only place that talks
 * to the ML backend — all inference itself happens server-side in
 * Python/OpenCV (see services/detector_service.py).
 */
class DetectionManager {
  constructor({ video, captureCanvas, apiBaseUrl, sessionId }) {
    this.video = video;
    this.captureCanvas = captureCanvas;
    this.captureCtx = captureCanvas.getContext("2d", { willReadFrequently: true });
    this.apiBaseUrl = apiBaseUrl;
    this.sessionId = sessionId;

    this.confidenceThreshold = 0.5;
    this.processingFps = 15;
    this.timer = null;
    this.inFlight = false;
    this.running = false;

    this.onResult = null; // (payload) => void
    this.onError = null;  // (err) => void
  }

  setThreshold(value01) {
    this.confidenceThreshold = value01;
  }

  setProcessingFps(fps) {
    this.processingFps = fps;
    if (this.running) {
      this._reschedule();
    }
  }

  start({ processingFps, confidenceThreshold, onResult, onError }) {
    this.processingFps = processingFps || this.processingFps;
    this.confidenceThreshold = confidenceThreshold ?? this.confidenceThreshold;
    this.onResult = onResult;
    this.onError = onError;
    this.running = true;
    this._reschedule();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  _reschedule() {
    if (this.timer) clearInterval(this.timer);
    const intervalMs = Math.max(1000 / this.processingFps, 30);
    this.timer = setInterval(() => this._tick(), intervalMs);
  }

  async _tick() {
    if (!this.running || this.inFlight) return;
    if (!this.video.videoWidth || !this.video.videoHeight) return;

    this.inFlight = true;
    const captureStart = performance.now();

    try {
      const blob = await this._captureFrame();
      const captureMs = performance.now() - captureStart;

      const form = new FormData();
      form.append("image", blob, "frame.jpg");
      form.append("session_id", this.sessionId);
      form.append("confidence_threshold", String(this.confidenceThreshold));

      const requestStart = performance.now();
      const response = await fetch(`${this.apiBaseUrl}/detect`, {
        method: "POST",
        body: form,
      });
      const roundTripMs = performance.now() - requestStart;

      if (!response.ok) {
        let detail = `Request failed (${response.status})`;
        try {
          const body = await response.json();
          detail = body.detail || body.error || detail;
        } catch (_) { /* ignore parse failure */ }
        throw Object.assign(new Error(detail), { type: "server", status: response.status });
      }

      const data = await response.json();
      const networkMs = Math.max(0, roundTripMs - data.processing_time_ms);

      this.onResult && this.onResult({
        ...data,
        capture_ms: captureMs,
        network_ms: networkMs,
        round_trip_ms: roundTripMs,
        timestamp: Date.now(),
      });
    } catch (err) {
      const type = err.type || (err instanceof TypeError ? "network" : "unknown");
      this.onError && this.onError({
        type,
        message: type === "network"
          ? "Cannot reach the detection backend. Is it running and reachable?"
          : err.message,
      });
    } finally {
      this.inFlight = false;
    }
  }

  _captureFrame() {
    const w = this.video.videoWidth;
    const h = this.video.videoHeight;
    this.captureCanvas.width = w;
    this.captureCanvas.height = h;
    // Draw the *unmirrored* raw frame (drawImage from a <video> ignores
    // CSS transforms), which is exactly what the backend needs.
    this.captureCtx.drawImage(this.video, 0, 0, w, h);

    return new Promise((resolve, reject) => {
      this.captureCanvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Failed to capture frame."))),
        "image/jpeg",
        0.85
      );
    });
  }
}

window.VisionAI = window.VisionAI || {};
window.VisionAI.DetectionManager = DetectionManager;
