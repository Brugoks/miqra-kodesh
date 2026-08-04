// Device token for account-free Q&R guests.
//
// This is not identity — it only scopes "one vote per device" and the
// submission rate limit. The server hashes it before storage, so the raw value
// never leaves this browser in a form that persists anywhere else.
//
// The shared-laptop kiosk in the room is the reason `clearGuestToken` exists:
// there, every student is a different person on the same device, so the token
// is rotated after each submission instead of being kept.

const STORAGE_KEY = 'miqra_qa_guest_token';

const randomToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export function getGuestToken() {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 16) return existing;
    const next = randomToken();
    localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    // Private browsing or blocked storage: fall back to a per-load token. The
    // guest can still submit and vote; those just won't persist past a reload.
    return randomToken();
  }
}

export function rotateGuestToken() {
  const next = randomToken();
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch { /* storage unavailable — caller still gets a usable token */ }
  return next;
}
