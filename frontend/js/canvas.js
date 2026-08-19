/**
 * canvas.js
 * ----------
 * Renders detection results on a transparent <canvas> layered above the
 * <video> element — the underlying video frame itself is never modified,
 * so the raw stream keeps flowing while boxes/labels/blur are drawn on
 * top each frame.
 */
class OverlayRenderer {
  constructor(canvasEl, videoEl) {
    this.canvas = canvasEl;
    this.video = videoEl;
    this.ctx = canvasEl.getContext("2d");
    this.privacyBlur = false;
  }

  /** Keep the canvas's pixel buffer in sync with the video's native resolution. */
  syncSize() {
    const w = this.video.videoWidth;
    const h = this.video.videoHeight;
    if (w && h && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draws every face's box + label, applying a real gaussian blur sourced
   * from the current video frame over each face region when privacy mode
   * is enabled.
   */
  draw(faces) {
    this.syncSize();
    this.clear();

    if (!faces || faces.length === 0) return;

    for (const face of faces) {
      const { x, y, width, height, id, confidence } = face;

      if (this.privacyBlur) {
        this._drawBlurRegion(x, y, width, height);
      }

      this._drawBox(x, y, width, height, id, confidence, this.privacyBlur);
    }
  }

  _drawBlurRegion(x, y, w, h) {
    const ctx = this.ctx;
    const pad = Math.round(Math.max(w, h) * 0.12);
    const bx = Math.max(0, x - pad);
    const by = Math.max(0, y - pad);
    const bw = Math.min(this.canvas.width - bx, w + pad * 2);
    const bh = Math.min(this.canvas.height - by, h + pad * 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();
    ctx.filter = "blur(16px)";
    // Source pixels come straight from the live video element — nothing
    // here is ever uploaded or stored, it exists only for this draw call.
    ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    ctx.filter = "none";
    ctx.restore();
  }

  _drawBox(x, y, w, h, id, confidence, muted) {
    const ctx = this.ctx;
    const color = muted ? "#f5b942" : "#4f8cff";
    const pct = (confidence * 100).toFixed(1);

    ctx.lineWidth = Math.max(2, this.canvas.width / 400);
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, w, h);

    const label = `FACE #${String(id).padStart(2, "0")}  ${pct}%`;
    const fontSize = Math.max(14, Math.round(this.canvas.width / 55));
    ctx.font = `600 ${fontSize}px Inter, "Segoe UI", sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const padX = 8, padY = 6;
    const labelW = textWidth + padX * 2;
    const labelH = fontSize + padY * 2;
    const labelY = y - labelH >= 0 ? y - labelH : y;

    /*
     * The live video is intentionally mirrored with CSS for a natural
     * webcam preview, and the overlay canvas is mirrored with it so the
     * detection boxes stay aligned. A canvas transform also mirrors text,
     * however. Draw the label in the opposite direction and place it at
     * the source-space right edge of the box so that, after the CSS mirror,
     * it appears at the normal top-left position of the face box.
     */
    const labelX = Math.max(0, Math.min(this.canvas.width - labelW, x + w - labelW));

    ctx.fillStyle = color;
    ctx.fillRect(labelX, labelY, labelW, labelH);

    ctx.fillStyle = "#0b0e14";
    ctx.textBaseline = "middle";

    ctx.save();
    const textX = labelX + padX;
    const textCenterX = labelX + labelW / 2;
    ctx.translate(2 * textCenterX, 0);
    ctx.scale(-1, 1);
    ctx.fillText(label, textX, labelY + labelH / 2);
    ctx.restore();
  }
}

window.VisionAI = window.VisionAI || {};
window.VisionAI.OverlayRenderer = OverlayRenderer;
