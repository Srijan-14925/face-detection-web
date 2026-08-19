/**
 * config.js
 * ----------
 * Single source of truth for the backend API URL.
 *
 * For local development this defaults to http://localhost:8000.
 * For production, set `window.__VISIONAI_API_URL__` before this script
 * runs (e.g. by templating it into index.html at deploy time, or by
 * editing the line below) — see the README's "Environment variables"
 * section. This keeps the backend URL out of the JS source itself so it
 * isn't hardcoded across the codebase.
 */
window.VisionAI = window.VisionAI || {};

window.VisionAI.API_BASE_URL =
  window.__VISIONAI_API_URL__ ||
  (location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:8000"
    : "");

if (!window.VisionAI.API_BASE_URL) {
  console.warn(
    "[VisionAI] No API base URL configured for this environment. " +
    "Set window.__VISIONAI_API_URL__ before config.js loads."
  );
}

// Generated once per browser tab session; identifies this camera stream
// to the backend so tracking IDs and analytics stay isolated per user.
window.VisionAI.SESSION_ID =
  (window.crypto && window.crypto.randomUUID)
    ? window.crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
