/**
 * settings.js
 * ------------
 * Wires up the Settings page: camera device list (via camera.js),
 * resolution/FPS choices, the confidence threshold slider, and privacy
 * mode. Preferences are kept in sessionStorage so they survive a reload
 * within the same tab, matching how detection history is scoped.
 */
class SettingsManager {
  constructor({ cameraManager, elements }) {
    this.cameraManager = cameraManager;
    this.el = elements;
    this.listeners = {}; // event name -> [callbacks]

    this._loadPersisted();
    this._bindEvents();
  }

  on(event, cb) {
    (this.listeners[event] = this.listeners[event] || []).push(cb);
  }

  _emit(event, payload) {
    (this.listeners[event] || []).forEach((cb) => cb(payload));
  }

  _loadPersisted() {
    const saved = JSON.parse(sessionStorage.getItem("visionai_settings") || "{}");
    this.state = {
      deviceId: saved.deviceId || null,
      resolution: saved.resolution || "1280x720",
      processingFps: saved.processingFps || 15,
      confidenceThreshold: saved.confidenceThreshold ?? 0.5,
      privacyBlur: saved.privacyBlur || false,
    };

    this.el.resolutionSelect.value = this.state.resolution;
    this.el.fpsSelect.value = String(this.state.processingFps);
    this.el.thresholdSlider.value = String(Math.round(this.state.confidenceThreshold * 100));
    this.el.thresholdValue.textContent = `${Math.round(this.state.confidenceThreshold * 100)}%`;
    this.el.privacyToggleSettings.checked = this.state.privacyBlur;
    this.el.privacyToggle.checked = this.state.privacyBlur;
  }

  _persist() {
    sessionStorage.setItem("visionai_settings", JSON.stringify(this.state));
  }

  async populateCameras() {
    try {
      const cameras = await this.cameraManager.listCameras();
      const select = this.el.cameraSelect;
      select.innerHTML = "";

      if (cameras.length === 0) {
        const opt = document.createElement("option");
        opt.textContent = "Default camera";
        opt.value = "";
        select.appendChild(opt);
        return;
      }

      cameras.forEach((cam, idx) => {
        const opt = document.createElement("option");
        opt.value = cam.deviceId;
        opt.textContent = cam.label || `Camera ${idx + 1}`;
        if (cam.deviceId === this.state.deviceId) opt.selected = true;
        select.appendChild(opt);
      });
    } catch (_) {
      // enumerateDevices can fail before permission is granted; harmless.
    }
  }

  getResolution() {
    const [w, h] = this.state.resolution.split("x").map(Number);
    return { width: w, height: h };
  }

  _bindEvents() {
    this.el.cameraSelect.addEventListener("change", (e) => {
      this.state.deviceId = e.target.value || null;
      this._persist();
    });

    this.el.resolutionSelect.addEventListener("change", (e) => {
      this.state.resolution = e.target.value;
      this._persist();
    });

    this.el.fpsSelect.addEventListener("change", (e) => {
      this.state.processingFps = Number(e.target.value);
      this._persist();
      this._emit("fpsChange", this.state.processingFps);
    });

    this.el.thresholdSlider.addEventListener("input", (e) => {
      const pct = Number(e.target.value);
      this.state.confidenceThreshold = pct / 100;
      this.el.thresholdValue.textContent = `${pct}%`;
      this._persist();
      this._emit("thresholdChange", this.state.confidenceThreshold);
    });

    const syncPrivacy = (checked, source) => {
      this.state.privacyBlur = checked;
      this.el.privacyToggle.checked = checked;
      this.el.privacyToggleSettings.checked = checked;
      this._persist();
      this._emit("privacyChange", checked);
    };
    this.el.privacyToggle.addEventListener("change", (e) => syncPrivacy(e.target.checked, "dashboard"));
    this.el.privacyToggleSettings.addEventListener("change", (e) => syncPrivacy(e.target.checked, "settings"));
  }
}

window.VisionAI = window.VisionAI || {};
window.VisionAI.SettingsManager = SettingsManager;
