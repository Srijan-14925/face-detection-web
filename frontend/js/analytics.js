/**
 * analytics.js
 * -------------
 * Populates the Analytics page from services/analytics_service.py's real,
 * server-recorded statistics (GET /analytics/{session_id}). Nothing here
 * is randomly generated or hardcoded — every chart point and stat comes
 * from detections that were actually run.
 */
class AnalyticsManager {
  constructor({ apiBaseUrl, sessionId }) {
    this.apiBaseUrl = apiBaseUrl;
    this.sessionId = sessionId;
    this.pollTimer = null;
    this.facesChart = null;
    this.confidenceChart = null;
    this.lastCurrentFaceCount = 0;
  }

  setCurrentFaceCount(count) {
    this.lastCurrentFaceCount = count;
  }

  startPolling(intervalMs = 2000) {
    this.stopPolling();
    this.refresh();
    this.pollTimer = setInterval(() => this.refresh(), intervalMs);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async refresh() {
    try {
      const url = `${this.apiBaseUrl}/analytics/${this.sessionId}?current_face_count=${this.lastCurrentFaceCount}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      this._renderStats(data);
      this._renderCharts(data.history);
    } catch (_) {
      // Analytics is a nice-to-have view; a failed poll shouldn't disrupt
      // the live camera/detection experience. It will retry on the next tick.
    }
  }

  _renderStats(data) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("aAvgConfidence", `${(data.average_confidence * 100).toFixed(1)}%`);
    set("aMaxFaces", data.max_simultaneous_faces);
    set("aAvgFps", data.average_fps.toFixed(1));
    set("aAvgLatency", `${data.average_latency_ms.toFixed(1)} ms`);
    set("aTotalFrames", data.frames_processed);
    set("aDuration", formatDuration(data.session_duration_seconds));
  }

  _renderCharts(history) {
    if (typeof Chart === "undefined") return; // CDN chart lib not loaded yet

    const labels = history.map((h) => new Date(h.timestamp * 1000).toLocaleTimeString());
    const faceCounts = history.map((h) => h.faces);
    const confidences = history.map((h) => Math.round(h.avg_confidence * 1000) / 10);

    const gridColor = "rgba(255,255,255,0.06)";
    const textColor = "#8f97a8";

    if (!this.facesChart) {
      const ctx = document.getElementById("facesChart");
      if (!ctx) return;
      this.facesChart = new Chart(ctx, {
        type: "line",
        data: { labels, datasets: [{
          label: "Faces detected",
          data: faceCounts,
          borderColor: "#4f8cff",
          backgroundColor: "rgba(79,140,255,0.15)",
          tension: 0.3,
          fill: true,
          pointRadius: 0,
        }]},
        options: chartOptions(gridColor, textColor, "Faces Over Time"),
      });
    } else {
      this.facesChart.data.labels = labels;
      this.facesChart.data.datasets[0].data = faceCounts;
      this.facesChart.update("none");
    }

    if (!this.confidenceChart) {
      const ctx = document.getElementById("confidenceChart");
      if (!ctx) return;
      this.confidenceChart = new Chart(ctx, {
        type: "line",
        data: { labels, datasets: [{
          label: "Average confidence (%)",
          data: confidences,
          borderColor: "#33d17a",
          backgroundColor: "rgba(51,209,122,0.15)",
          tension: 0.3,
          fill: true,
          pointRadius: 0,
        }]},
        options: chartOptions(gridColor, textColor, "Average Confidence Over Time"),
      });
    } else {
      this.confidenceChart.data.labels = labels;
      this.confidenceChart.data.datasets[0].data = confidences;
      this.confidenceChart.update("none");
    }
  }
}

function chartOptions(gridColor, textColor, title) {
  return {
    responsive: true,
    animation: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: title, color: textColor, font: { size: 12 } },
    },
    scales: {
      x: { ticks: { color: textColor, maxTicksLimit: 8 }, grid: { color: gridColor } },
      y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true },
    },
  };
}

function formatDuration(totalSeconds) {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

window.VisionAI = window.VisionAI || {};
window.VisionAI.AnalyticsManager = AnalyticsManager;
window.VisionAI.formatDuration = formatDuration;
