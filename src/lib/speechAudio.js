// One <audio> element for reading aloud, unlocked inside the tap that asked
// for it.
//
// Safari (macOS and iOS, so every iPhone, PWA included) only lets a page start
// sound from inside a user gesture. "Read aloud" taps, then waits several
// seconds for a voice to be synthesised, then plays — and by then the tap has
// expired, so `new Audio(url).play()` is refused with NotAllowedError and the
// reader silently falls back to another voice (or reports an error). Cached
// audio comes back fast enough to squeeze inside the gesture, which is why a
// passage heard before still worked and a new one never did.
//
// An element that has played once inside a gesture stays allowed to play, so
// the fix is to make that element in the tap — playing a few milliseconds of
// silence so the browser marks it — and then give every chunk to the same
// element by changing its src. Chrome and Firefox allow either way; this is
// harmless there.

// A tenth of a second of silence as a WAV data URI, built rather than pasted
// in as an opaque string: 8 kHz, 16-bit mono.
function buildSilentWav() {
  const samples = 800;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true); // sample rate
  view.setUint32(28, 16000, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  let binary = '';
  new Uint8Array(buffer).forEach((byte) => { binary += String.fromCharCode(byte); });
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export const SILENT_WAV = typeof btoa === 'function' ? buildSilentWav() : '';

// Call synchronously at the top of a click handler, before any await. Returns
// the element to play every chunk on (reusing `existing` if there is one).
export function primeSpeechAudio(existing = null) {
  if (typeof Audio === 'undefined') return existing;
  const audio = existing || new Audio();
  audio.onplay = null;
  audio.onended = null;
  audio.onpause = null;
  audio.onerror = null;
  audio.src = SILENT_WAV;
  const started = audio.play();
  if (started?.then) {
    // Stop the silence once it has done its job — unless real audio has
    // already been given to the element, which must not be paused.
    started.then(() => {
      if (audio.src === SILENT_WAV) audio.pause();
    }).catch(() => {});
  }
  return audio;
}
