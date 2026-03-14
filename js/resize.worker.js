// resize.worker.js

self.onmessage = async (e) => {
  const { file, targetKB } = e.data;
  const port = e.ports[0];
  try {
    const bitmap = await createImageBitmap(file);

    // Default dimensions
    let width = bitmap.width;
    let height = bitmap.height;

    // Apply orientation dimension caps
    const MAX_LANDSCAPE = 1920;
    const MAX_PORTRAIT = 1080;
    const MAX_SQUARE = 1080;

    if (width > height) { // Landscape
      if (width > MAX_LANDSCAPE) {
        height = Math.round((height * MAX_LANDSCAPE) / width);
        width = MAX_LANDSCAPE;
      }
    } else if (height > width) { // Portrait
      if (height > MAX_PORTRAIT) {
        width = Math.round((width * MAX_PORTRAIT) / height);
        height = MAX_PORTRAIT;
      }
    } else { // Square
      if (width > MAX_SQUARE) {
        width = MAX_SQUARE;
        height = MAX_SQUARE;
      }
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // 0.85 max quality to prevent bloat, dynamically scale down
    const quality = Math.min(0.85, Math.max(0.1, ((targetKB * 1024) / file.size) * 0.85));
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });

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
