/**
 * camera.js
 * ----------
 * Owns the browser webcam. The Python backend never touches the camera —
 * it only ever receives individual frames that this module captures and
 * hands off (see detection.js).
 */
class CameraManager {
  constructor(videoEl) {
    this.videoEl = videoEl;
    this.stream = null;
    this.currentDeviceId = null;
  }

  /** Returns true if this browser can plausibly support webcam capture. */
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /** Lists available video input devices. Labels are only populated after permission is granted once. */
  async listCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput");
  }

  /**
   * Starts the camera with the given constraints.
   * @param {Object} opts - { deviceId, width, height }
   * @returns {Promise<void>}
   * @throws {Error} with a `.code` field identifying the failure type
   */
  async start(opts = {}) {
    if (!CameraManager.isSupported()) {
      const err = new Error("This browser does not support camera access (getUserMedia unavailable).");
      err.code = "UNSUPPORTED";
      throw err;
    }

    const videoConstraints = {
      width: { ideal: opts.width || 1280 },
      height: { ideal: opts.height || 720 },
    };
    if (opts.deviceId) {
      videoConstraints.deviceId = { exact: opts.deviceId };
    } else {
      videoConstraints.facingMode = "user";
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      this.stream = stream;
      this.currentDeviceId = opts.deviceId || null;
      this.videoEl.srcObject = stream;
      await this.videoEl.play();
    } catch (err) {
      const wrapped = new Error(CameraManager._friendlyError(err));
      wrapped.code = err.name || "UNKNOWN";
      throw wrapped;
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.videoEl.srcObject = null;
  }

  isActive() {
    return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === "live");
  }

  static _friendlyError(err) {
    switch (err.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Camera permission denied. Allow camera access in your browser settings and try again.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No camera was found on this device.";
      case "NotReadableError":
      case "TrackStartError":
        return "The camera is unavailable — it may be in use by another application.";
      case "OverconstrainedError":
        return "The selected camera does not support the requested resolution.";
      case "SecurityError":
        return "Camera access requires a secure (HTTPS) connection.";
      default:
        return `Could not access the camera (${err.name || "unknown error"}).`;
    }
  }
}

window.VisionAI = window.VisionAI || {};
window.VisionAI.CameraManager = CameraManager;
