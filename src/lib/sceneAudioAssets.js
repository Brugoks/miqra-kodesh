// Visit-scoped decoded recordings and their playback nodes. Loops already
// have crossfaded seams; fade-in here makes asynchronous loading unobtrusive.
import { SCENE_AUDIO_ASSETS } from '../components/scene/sceneAudioManifest';

export function createSampleBank(context, { onError } = {}) {
  let disposed = false;
  const bufferCache = new Map();
  const pending = new Map();
  const active = new Map();
  const requests = new AbortController();

  function loadSample(audioDef) {
    if (!audioDef?.url || disposed || !context) return Promise.resolve(null);
    if (bufferCache.has(audioDef.id)) return Promise.resolve(bufferCache.get(audioDef.id));
    if (pending.has(audioDef.id)) return pending.get(audioDef.id);

    const request = (async () => {
      try {
        const response = await fetch(audioDef.url, { signal: requests.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (disposed) return null;
        const buffer = await new Promise((resolve, reject) => {
          // Support both callback and promise implementations of Web Audio.
          context.decodeAudioData(bytes, resolve, reject)?.then?.(resolve, reject);
        });
        if (disposed) return null;
        bufferCache.set(audioDef.id, buffer);
        return buffer;
      } catch (error) {
        if (!disposed) {
          console.warn(`[sceneAudioAssets] Failed to load ${audioDef.id}:`, error.message);
          onError?.(error);
        }
        return null;
      } finally {
        pending.delete(audioDef.id);
      }
    })();
    pending.set(audioDef.id, request);
    return request;
  }

  async function preloadAll(ids) {
    const selected = ids ? new Set(ids) : null;
    await Promise.allSettled(SCENE_AUDIO_ASSETS
      .filter((asset) => !selected || selected.has(asset.id)).map(loadSample));
  }

  function play(id, destination, { volume = 1, playbackRate = 1, loop = false, fadeIn = 0, offset = 0 } = {}) {
    const buffer = bufferCache.get(id);
    if (disposed || !context || !buffer) return null;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = playbackRate;
    gain.gain.value = fadeIn > 0 ? 0 : volume;
    source.connect(gain);
    gain.connect(destination);

    const cleanup = () => {
      active.delete(source);
      source.onended = null;
      source.disconnect();
      gain.disconnect();
    };
    const stop = () => {
      if (!active.has(source)) return;
      try { source.stop(); } catch { /* Already ended. */ }
      cleanup();
    };
    active.set(source, stop);
    source.onended = cleanup;
    try {
      const now = context.currentTime;
      if (fadeIn > 0) {
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + fadeIn);
      }
      source.start(0, Math.max(0, offset) % buffer.duration);
      return { source, gain, stop };
    } catch {
      stop();
      return null;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    requests.abort();
    for (const stop of [...active.values()]) stop();
    bufferCache.clear();
    pending.clear();
  }

  return {
    loadSample,
    preloadAll,
    playOneShot: (id, destination, options) => play(id, destination, options)?.source || null,
    startLoop: (id, destination, options) => play(id, destination, { ...options, loop: true }),
    hasSample: (id) => bufferCache.has(id),
    dispose,
    isDisposed: () => disposed,
  };
}
