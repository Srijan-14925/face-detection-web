/**
 * app.js
 * -------
 * Bootstraps the VisionAI dashboard: wires the camera, detection,
 * canvas overlay, analytics, and settings modules together, drives page
 * navigation, and owns UI-only state (metrics display, history,
 * snapshots, loading/error banners).
 */
(function () {
  const NS = window.VisionAI;
  const API = NS.API_BASE_URL;
  const SESSION_ID = NS.SESSION_ID;

  // ---------------------------------------------------------------------
  // Element references
  // ---------------------------------------------------------------------
  const els = {
    sidebar: document.getElementById("sidebar"),
    sidebarBackdrop: document.getElementById("sidebarBackdrop"),
    sidebarToggle: document.getElementById("sidebarToggle"),
    navItems: Array.from(document.querySelectorAll(".nav-item")),
    pages: Array.from(document.querySelectorAll(".page")),

    statusDot: document.getElementById("statusDot"),
    statusText: document.getElementById("statusText"),
    bannerArea: document.getElementById("bannerArea"),

    miName: document.getElementById("miName"),
    miFramework: document.getElementById("miFramework"),
    miInput: document.getElementById("miInput"),
    miStatus: document.getElementById("miStatus"),

    video: document.getElementById("video"),
    overlay: document.getElementById("overlay"),
    captureCanvas: document.getElementById("captureCanvas"),
    cameraStage: document.getElementById("cameraStage"),
    cameraPlaceholder: document.getElementById("cameraPlaceholder"),
    cameraLoading: document.getElementById("cameraLoading"),
    cameraLoadingText: document.getElementById("cameraLoadingText"),
    cameraStatePill: document.getElementById("cameraStatePill"),

    btnStart: document.getElementById("btnStart"),
    btnStop: document.getElementById("btnStop"),
    btnSnapshot: document.getElementById("btnSnapshot"),
    btnFullscreen: document.getElementById("btnFullscreen"),
    privacyToggle: document.getElementById("privacyToggle"),

    mFaces: document.getElementById("mFaces"),
    mConfidence: document.getElementById("mConfidence"),
    mFps: document.getElementById("mFps"),
    mLatency: document.getElementById("mLatency"),
    mDuration: document.getElementById("mDuration"),
    mFrames: document.getElementById("mFrames"),

    pInference: document.getElementById("pInference"),
    pNetwork: document.getElementById("pNetwork"),
    pRender: document.getElementById("pRender"),
    pTotal: document.getElementById("pTotal"),
    pFps: document.getElementById("pFps"),

    facesList: document.getElementById("facesList"),

    historyList: document.getElementById("historyList"),
    btnClearHistory: document.getElementById("btnClearHistory"),

    cameraSelect: document.getElementById("cameraSelect"),
    resolutionSelect: document.getElementById("resolutionSelect"),
    fpsSelect: document.getElementById("fpsSelect"),
    thresholdSlider: document.getElementById("thresholdSlider"),
    thresholdValue: document.getElementById("thresholdValue"),
    privacyToggleSettings: document.getElementById("privacyToggleSettings"),
  };

  // ---------------------------------------------------------------------
  // Module instances
  // ---------------------------------------------------------------------
  const cameraManager = new NS.CameraManager(els.video);
  const overlayRenderer = new NS.OverlayRenderer(els.overlay, els.video);
  const detectionManager = new NS.DetectionManager({
    video: els.video,
    captureCanvas: els.captureCanvas,
    apiBaseUrl: API,
    sessionId: SESSION_ID,
  });
  const analyticsManager = new NS.AnalyticsManager({ apiBaseUrl: API, sessionId: SESSION_ID });
  const settingsManager = new NS.SettingsManager({ cameraManager, elements: els });

  // ---------------------------------------------------------------------
  // Runtime state
  // ---------------------------------------------------------------------
  const runtime = {
    isRunning: false,
    sessionStart: null,
    framesProcessed: 0,
    recentTimestamps: [], // for rolling FPS
    recentConfidences: [], // for rolling average confidence
    maxFacesSeen: 0,
    lastLatencyMs: 0,
    durationTimer: null,
  };

  overlayRenderer.privacyBlur = settingsManager.state.privacyBlur;

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------
  function showPage(name) {
    els.pages.forEach((p) => p.classList.toggle("active", p.id === `page-${name}`));
    els.navItems.forEach((n) => n.classList.toggle("active", n.dataset.page === name));
    closeSidebar();

    if (name === "analytics") {
      analyticsManager.setCurrentFaceCount(runtime.lastFaceCount || 0);
      analyticsManager.startPolling();
    } else {
      analyticsManager.stopPolling();
    }
  }

  els.navItems.forEach((btn) => btn.addEventListener("click", () => showPage(btn.dataset.page)));

  function openSidebar() {
    els.sidebar.classList.add("open");
    els.sidebarBackdrop.classList.add("open");
  }
  function closeSidebar() {
    els.sidebar.classList.remove("open");
    els.sidebarBackdrop.classList.remove("open");
  }
  els.sidebarToggle.addEventListener("click", openSidebar);
  els.sidebarBackdrop.addEventListener("click", closeSidebar);

  // ---------------------------------------------------------------------
  // Banners
  // ---------------------------------------------------------------------
  function showBanner(message, kind = "error", id = null) {
    if (id && document.getElementById(id)) return; // avoid duplicate persistent banners
    const div = document.createElement("div");
    div.className = `banner banner--${kind}`;
    if (id) div.id = id;
    div.innerHTML = `<span></span><button aria-label="Dismiss">×</button>`;
    div.querySelector("span").textContent = message;
    div.querySelector("button").addEventListener("click", () => div.remove());
    els.bannerArea.appendChild(div);
    return div;
  }
  function clearBanner(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  // ---------------------------------------------------------------------
  // Health / model info polling
  // ---------------------------------------------------------------------
  async function pollHealth() {
    try {
      const res = await fetch(`${API}/health`);
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();

      els.statusDot.className = `status-dot ${data.model_loaded ? "online" : "degraded"}`;
      els.statusText.textContent = data.model_loaded ? "Online" : "Degraded — model not loaded";
      els.miStatus.textContent = data.model_loaded ? "Loaded" : "Not Loaded";
      els.miStatus.className = `pill ${data.model_loaded ? "pill--on" : "pill--off"}`;
      els.miName.textContent = data.model;
      els.miFramework.textContent = data.framework;
      clearBanner("backend-offline-banner");

      if (!data.model_loaded) {
        showBanner(
          "The face detection model failed to load on the server. Detection will not work until this is fixed.",
          "warn",
          "model-not-loaded-banner"
        );
      } else {
        clearBanner("model-not-loaded-banner");
      }
    } catch (_) {
      els.statusDot.className = "status-dot offline";
      els.statusText.textContent = "Offline";
      els.miStatus.textContent = "Unknown";
      els.miStatus.className = "pill pill--off";
      showBanner(
        "Cannot reach the detection backend. Check that the API server is running and CORS is configured.",
        "error",
        "backend-offline-banner"
      );
    }
  }

  async function loadModelInfo() {
    try {
      const res = await fetch(`${API}/settings/model-info`);
      if (!res.ok) return;
      const data = await res.json();
      els.miInput.textContent = data.input_size;
    } catch (_) { /* health poll will surface connectivity issues */ }
  }

  pollHealth();
  loadModelInfo();
  setInterval(pollHealth, 5000);

  // ---------------------------------------------------------------------
  // Camera start / stop
  // ---------------------------------------------------------------------
  async function startCamera() {
    if (!NS.CameraManager.isSupported()) {
      showBanner("This browser does not support camera access.", "error");
      return;
    }

    els.cameraPlaceholder.hidden = true;
    els.cameraLoading.hidden = false;
    els.cameraLoadingText.textContent = "Requesting camera permission…";
    els.btnStart.disabled = true;

    const { width, height } = settingsManager.getResolution();

    try {
      await cameraManager.start({ deviceId: settingsManager.state.deviceId, width, height });
    } catch (err) {
      els.cameraLoading.hidden = true;
      els.cameraPlaceholder.hidden = false;
      els.btnStart.disabled = false;
      showBanner(err.message, "error");
      return;
    }

    els.cameraLoadingText.textContent = "Waiting for video stream…";
    await new Promise((resolve) => {
      if (els.video.readyState >= 2) return resolve();
      els.video.onloadeddata = () => resolve();
    });

    await settingsManager.populateCameras();

    overlayRenderer.syncSize();
    els.cameraLoading.hidden = true;
    els.btnStop.disabled = false;
    els.btnSnapshot.disabled = false;
    els.btnFullscreen.disabled = false;
    els.cameraStatePill.textContent = "Camera On";
    els.cameraStatePill.classList.add("pill--on");

    resetRuntimeStats();
    runtime.isRunning = true;
    runtime.sessionStart = Date.now();
    runtime.durationTimer = setInterval(updateDuration, 1000);

    detectionManager.start({
      processingFps: settingsManager.state.processingFps,
      confidenceThreshold: settingsManager.state.confidenceThreshold,
      onResult: handleDetectionResult,
      onError: handleDetectionError,
    });
  }

  function stopCamera() {
    detectionManager.stop();
    cameraManager.stop();
    runtime.isRunning = false;
    clearInterval(runtime.durationTimer);

    overlayRenderer.clear();
    els.cameraPlaceholder.hidden = false;
    els.btnStart.disabled = false;
    els.btnStop.disabled = true;
    els.btnSnapshot.disabled = true;
    els.btnFullscreen.disabled = true;
    els.cameraStatePill.textContent = "Camera Off";
    els.cameraStatePill.classList.remove("pill--on");
    clearBanner("detection-error-banner");

    renderFacesList([]);
    els.mFaces.textContent = "0";
  }

  function resetRuntimeStats() {
    runtime.framesProcessed = 0;
    runtime.recentTimestamps = [];
    runtime.recentConfidences = [];
    runtime.maxFacesSeen = 0;
    runtime.lastFaceCount = 0;
    els.mFrames.textContent = "0";
    els.mDuration.textContent = "00:00";
  }

  function updateDuration() {
    if (!runtime.sessionStart) return;
    const seconds = (Date.now() - runtime.sessionStart) / 1000;
    els.mDuration.textContent = NS.formatDuration(seconds);
  }

  els.btnStart.addEventListener("click", startCamera);
  els.btnStop.addEventListener("click", stopCamera);

  // ---------------------------------------------------------------------
  // Detection results -> UI
  // ---------------------------------------------------------------------
  function handleDetectionResult(data) {
    clearBanner("detection-error-banner");

    const renderStart = performance.now();
    overlayRenderer.draw(data.faces);
    const renderMs = performance.now() - renderStart;

    runtime.framesProcessed += 1;
    runtime.lastFaceCount = data.count;
    runtime.maxFacesSeen = Math.max(runtime.maxFacesSeen, data.count);
    runtime.lastLatencyMs = data.processing_time_ms;
    runtime.lastNetworkMs = data.network_ms;
    runtime.lastRenderMs = renderMs;
    runtime.lastSnapshotFaces = data.faces;

    runtime.recentTimestamps.push(data.timestamp);
    if (runtime.recentTimestamps.length > 30) runtime.recentTimestamps.shift();

    data.faces.forEach((f) => {
      runtime.recentConfidences.push(f.confidence);
    });
    if (runtime.recentConfidences.length > 150) {
      runtime.recentConfidences.splice(0, runtime.recentConfidences.length - 150);
    }

    // ---- Metrics ----
    els.mFaces.textContent = String(data.count);
    els.mFrames.textContent = String(runtime.framesProcessed);
    els.mLatency.textContent = `${data.processing_time_ms.toFixed(1)} ms`;

    const avgConfidence = runtime.recentConfidences.length
      ? runtime.recentConfidences.reduce((a, b) => a + b, 0) / runtime.recentConfidences.length
      : null;
    els.mConfidence.textContent = avgConfidence !== null ? `${(avgConfidence * 100).toFixed(1)}%` : "—";

    const fps = computeRollingFps(runtime.recentTimestamps);
    els.mFps.textContent = fps.toFixed(1);

    // ---- Performance monitor ----
    els.pInference.textContent = `${data.processing_time_ms.toFixed(1)} ms`;
    els.pNetwork.textContent = `${data.network_ms.toFixed(1)} ms`;
    els.pRender.textContent = `${renderMs.toFixed(1)} ms`;
    els.pTotal.textContent = `${(data.round_trip_ms + renderMs).toFixed(1)} ms`;
    els.pFps.textContent = fps.toFixed(1);

    renderFacesList(data.faces);
    analyticsManager.setCurrentFaceCount(data.count);
  }

  function computeRollingFps(timestamps) {
    if (timestamps.length < 2) return 0;
    const span = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
    if (span <= 0) return 0;
    return (timestamps.length - 1) / span;
  }

  function handleDetectionError(err) {
    showBanner(err.message, "error", "detection-error-banner");
  }

  function renderFacesList(faces) {
    if (!faces || faces.length === 0) {
      els.facesList.innerHTML = `<li class="faces-empty">No faces currently detected.</li>`;
      return;
    }
    els.facesList.innerHTML = faces
      .map(
        (f) =>
          `<li><span class="face-id">FACE #${String(f.id).padStart(2, "0")}</span><span>${(f.confidence * 100).toFixed(1)}%</span></li>`
      )
      .join("");
  }

  // ---------------------------------------------------------------------
  // Settings wiring
  // ---------------------------------------------------------------------
  settingsManager.on("thresholdChange", (value) => detectionManager.setThreshold(value));
  settingsManager.on("fpsChange", (fps) => detectionManager.setProcessingFps(fps));
  settingsManager.on("privacyChange", (checked) => {
    overlayRenderer.privacyBlur = checked;
  });

  // ---------------------------------------------------------------------
  // Snapshot capture
  // ---------------------------------------------------------------------
  els.btnSnapshot.addEventListener("click", () => {
    if (!cameraManager.isActive()) return;

    const w = els.video.videoWidth;
    const h = els.video.videoHeight;
    const snapCanvas = document.createElement("canvas");
    snapCanvas.width = w;
    snapCanvas.height = h;
    const ctx = snapCanvas.getContext("2d");

    // Mirror the final composite to match the on-screen webcam preview.
    // The overlay canvas contains the same raw-coordinate drawing; its
    // label text is counter-mirrored in canvas.js so the final snapshot
    // remains readable after this mirror operation.
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(els.video, 0, 0, w, h);
    ctx.drawImage(els.overlay, 0, 0, w, h);

    const fullDataUrl = snapCanvas.toDataURL("image/jpeg", 0.9);

    // Store a smaller thumbnail in sessionStorage to respect quota.
    const thumbCanvas = document.createElement("canvas");
    const scale = 320 / w;
    thumbCanvas.width = 320;
    thumbCanvas.height = Math.round(h * scale);
    thumbCanvas.getContext("2d").drawImage(snapCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const thumbDataUrl = thumbCanvas.toDataURL("image/jpeg", 0.6);

    const faces = runtime.lastSnapshotFaces || [];
    const avgConfidence = faces.length
      ? faces.reduce((a, f) => a + f.confidence, 0) / faces.length
      : 0;

    const entry = {
      timestamp: Date.now(),
      faceCount: faces.length,
      avgConfidence,
      maxFacesInSession: runtime.maxFacesSeen,
      thumbnail: thumbDataUrl,
    };

    addHistoryEntry(entry);
    downloadImage(fullDataUrl, `visionai-snapshot-${entry.timestamp}.jpg`);
  });

  function downloadImage(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------------------------------------------------------------------
  // History (sessionStorage-backed, bounded)
  // ---------------------------------------------------------------------
  const HISTORY_KEY = "visionai_history";
  const HISTORY_MAX_ENTRIES = 20;

  function loadHistory() {
    try {
      return JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveHistory(list) {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (_) {
      // Quota exceeded — drop the oldest half and retry once.
      const trimmed = list.slice(0, Math.ceil(list.length / 2));
      try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed)); } catch (__) { /* give up silently */ }
    }
  }

  function addHistoryEntry(entry) {
    const list = loadHistory();
    list.unshift(entry);
    while (list.length > HISTORY_MAX_ENTRIES) list.pop();
    saveHistory(list);
    renderHistory();
  }

  function renderHistory() {
    const list = loadHistory();
    if (list.length === 0) {
      els.historyList.innerHTML = `<p class="empty-note">No snapshots yet. Use <b>Capture Snapshot</b> on the Dashboard.</p>`;
      return;
    }
    els.historyList.innerHTML = list
      .map((e) => {
        const d = new Date(e.timestamp);
        const dateStr = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
        const timeStr = d.toLocaleTimeString();
        return `
          <div class="history-item">
            <img src="${e.thumbnail}" alt="Detection snapshot" />
            <div class="hi-body">
              <span class="hi-time">${dateStr} · ${timeStr}</span>
              <span class="hi-stats">${e.faceCount} Face${e.faceCount === 1 ? "" : "s"} · ${(e.avgConfidence * 100).toFixed(1)}% avg confidence</span>
            </div>
          </div>`;
      })
      .join("");
  }

  els.btnClearHistory.addEventListener("click", () => {
    sessionStorage.removeItem(HISTORY_KEY);
    renderHistory();
  });

  renderHistory();

  // ---------------------------------------------------------------------
  // Fullscreen
  // ---------------------------------------------------------------------
  els.btnFullscreen.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await els.cameraStage.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (_) {
      showBanner("Fullscreen is not available in this browser/context.", "warn");
    }
  });

  // ---------------------------------------------------------------------
  // Cleanup on unload
  // ---------------------------------------------------------------------
  window.addEventListener("beforeunload", () => {
    if (runtime.isRunning) stopCamera();
  });
})();
