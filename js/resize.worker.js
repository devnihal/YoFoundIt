/**
 * @file resize.worker.js
 * @description Web Worker for off-thread image resizing before upload.
 *
 * Receives a { file, targetKB } message via the main thread (optionally with
 * a MessageChannel port for structured replies). Decodes the image with
 * createImageBitmap, enforces per-orientation dimension caps, re-encodes as
 * JPEG at a calculated quality level, and posts the resulting Blob back.
 *
 * Orientation caps:
 *   Landscape  → max 1920 px wide
 *   Portrait   → max 1080 px tall
 *   Square     → max 1080 px on each side
 */

self.onmessage = async (e) => {
  const { file, targetKB } = e.data;
  const port = e.ports[0];
  try {
    const bitmap = await createImageBitmap(file);

    let width = bitmap.width;
    let height = bitmap.height;

    const MAX_LANDSCAPE = 1920;
    const MAX_PORTRAIT  = 1080;
    const MAX_SQUARE    = 1080;

    if (width > height) {
      /* Landscape — cap width */
      if (width > MAX_LANDSCAPE) {
        height = Math.round((height * MAX_LANDSCAPE) / width);
        width  = MAX_LANDSCAPE;
      }
    } else if (height > width) {
      /* Portrait — cap height */
      if (height > MAX_PORTRAIT) {
        width  = Math.round((width * MAX_PORTRAIT) / height);
        height = MAX_PORTRAIT;
      }
    } else {
      /* Square — cap both sides equally */
      if (width > MAX_SQUARE) {
        width  = MAX_SQUARE;
        height = MAX_SQUARE;
      }
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx    = canvas.getContext('2d', { alpha: false });
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    /*
     * Clamp quality between 0.1 and 0.85 — the upper bound prevents excessive
     * file sizes while the lower bound keeps output visually acceptable.
     */
    const quality = Math.min(0.85, Math.max(0.1, ((targetKB * 1024) / file.size) * 0.85));
    const blob    = await canvas.convertToBlob({ type: 'image/jpeg', quality });

    if (port) {
      port.postMessage({ blob, name: file.name });
    } else {
      self.postMessage({ blob, name: file.name });
    }
  } catch (error) {
    if (port) {
      port.postMessage({ error: error.message });
    } else {
      self.postMessage({ error: error.message });
    }
  }
};
