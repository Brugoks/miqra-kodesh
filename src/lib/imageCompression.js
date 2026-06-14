// Client-side image downscale + re-encode before upload, to keep the Storage
// bucket small and speed up uploads on mobile data. Never blocks an upload:
// on any failure or unsupported format it returns the original file untouched.

const DEFAULT_MAX_DIM = 1600;     // longest edge, px — plenty for chat/photos
const DEFAULT_QUALITY = 0.8;      // WebP quality
const SKIP_BELOW_BYTES = 150 * 1024; // tiny images aren't worth re-encoding

// Canvas can't reliably decode these (animation / no browser support), so we
// upload them as-is rather than silently corrupting them.
const PASSTHROUGH_TYPES = ['image/gif', 'image/heic', 'image/heif'];

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation honors EXIF rotation so portrait photos aren't sideways.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to <img> below */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

export async function compressImage(file, {
  maxDimension = DEFAULT_MAX_DIM,
  quality = DEFAULT_QUALITY,
} = {}) {
  if (!file || !file.type?.startsWith('image/')) return file;
  if (PASSTHROUGH_TYPES.includes(file.type)) return file;
  if (file.size <= SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await loadBitmap(file);
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    if (!srcW || !srcH) return file;

    const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
    const targetW = Math.round(srcW * scale);
    const targetH = Math.round(srcH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    if (typeof bitmap.close === 'function') bitmap.close();

    const blob = await canvasToBlob(canvas, 'image/webp', quality);
    // No gain (or WebP unsupported → null): keep the original.
    if (!blob || blob.size >= file.size) return file;

    const name = `${(file.name || 'image').replace(/\.[^.]+$/, '')}.webp`;
    return new File([blob], name, { type: 'image/webp', lastModified: file.lastModified || Date.now() });
  } catch {
    return file;
  }
}
