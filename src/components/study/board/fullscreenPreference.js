// Whether a canvas opens full window. It does by default; the person's last deliberate choice (Exit full screen,
// Escape, or the Full screen button) is remembered on this device. Back is not a choice — it is navigation — so it
// is never remembered. Like the view preference, it is a per-device convenience and never touches the canvas.

const key = (userId) => `miqra_canvas_fullscreen_v1:${userId}`;

export function readFullscreenPreference(userId) {
  try { return localStorage.getItem(key(userId)) !== 'off'; } catch { return true; }
}

export function rememberFullscreen(userId, on) {
  try { localStorage.setItem(key(userId), on ? 'on' : 'off'); } catch { /* the choice just won't be remembered */ }
}
