// Audio sample bank and recorded layer manager for immersive scene audio.
// Handles on-demand sample preloading, caching per AudioContext visit,
// gap-free looping, distance-driven one-shot footsteps, and crossfades.

import { SCENE_ASSET_MANIFEST } from '../components/scene/sceneAssetManifest';

export function createSampleBank(context, { sceneSlug = 'capernaum', onError } = {}) {
  let disposed = false;
  const bufferCache = new Map();
  const activeSources = new Set();
  const manifestAudio = [
    ...(SCENE_ASSET_MANIFEST[sceneSlug]?.audio || []),
    ...(SCENE_ASSET_MANIFEST.shared?.audio || []),
  ];

  async function loadSample(audioDef) {
    if (!audioDef?.url || disposed || !context) return null;
    if (bufferCache.has(audioDef.id)) return bufferCache.get(audioDef.id);

    try {
      const resp = await fetch(audioDef.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const arrayBuffer = await resp.arrayBuffer();
      if (disposed) return null;

      const audioBuffer = await new Promise((resolve, reject) => {
        // Modern and legacy callback signatures
        const promise = context.decodeAudioData(arrayBuffer, resolve, reject);
        if (promise?.catch) promise.catch(reject);
      });

      if (disposed) return null;
      bufferCache.set(audioDef.id, audioBuffer);
      return audioBuffer;
    } catch (err) {
      if (!disposed) {
        console.warn(`[sceneAudioAssets] Failed to load sample ${audioDef.id}:`, err.message);
        onError?.(err);
      }
      return null;
    }
  }

  async function preloadAll() {
    const promises = manifestAudio.map(loadSample);
    await Promise.allSettled(promises);
  }

  function playOneShot(id, destination, { volume = 1.0, playbackRate = 1.0 } = {}) {
    if (disposed || !context) return null;
    const buffer = bufferCache.get(id);
    if (!buffer) return null;

    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate;

      const gain = context.createGain();
      gain.gain.value = volume;

      source.connect(gain);
      gain.connect(destination);

      activeSources.add(source);
      source.onended = () => {
        activeSources.delete(source);
        try {
          source.disconnect();
          gain.disconnect();
        } catch {
          // Safe disconnect fallback
        }
      };

      source.start(0);
      return source;
    } catch {
      return null;
    }
  }

  function startLoop(id, destination, { volume = 0.5 } = {}) {
    if (disposed || !context) return null;
    const buffer = bufferCache.get(id);
    if (!buffer) return null;

    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gain = context.createGain();
      gain.gain.value = volume;

      source.connect(gain);
      gain.connect(destination);

      activeSources.add(source);
      source.start(0);

      return {
        source,
        gain,
        stop: () => {
          activeSources.delete(source);
          try {
            source.stop();
            source.disconnect();
            gain.disconnect();
          } catch {
            // Safe teardown
          }
        },
      };
    } catch {
      return null;
    }
  }

  function dispose() {
    disposed = true;
    activeSources.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Safe teardown
      }
    });
    activeSources.clear();
    bufferCache.clear();
  }

  return {
    loadSample,
    preloadAll,
    playOneShot,
    startLoop,
    hasSample: (id) => bufferCache.has(id),
    dispose,
    isDisposed: () => disposed,
  };
}
