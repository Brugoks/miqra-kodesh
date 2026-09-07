// Quality profiles, persistence, and adaptive resolution scaling for biblical scenes.
//
// Defines canonical low, balanced, and high profiles. User preference is persisted
// under miqra_scene_quality. Auto mode adapts resolution dynamically at runtime
// based on windowed frame-rate sampling with hysteresis and cooldowns.

export const QUALITY_KEY = 'miqra_scene_quality';

export const QUALITY_PROFILES = {
  low: {
    name: 'low',
    pixelRatioCeiling: 1.0,
    shadowMapSize: 0,
    dynamicActors: 2,
    assetDetail: 'low',
    gtao: false,
    bloom: false,
    grain: false,
    terrainDensity: 'sparse',
  },
  balanced: {
    name: 'balanced',
    pixelRatioCeiling: 1.5,
    shadowMapSize: 1024,
    dynamicActors: 4,
    assetDetail: 'medium',
    gtao: false,
    bloom: false,
    grain: false,
    terrainDensity: 'moderate',
  },
  high: {
    name: 'high',
    pixelRatioCeiling: 2.0,
    shadowMapSize: 2048,
    dynamicActors: 6,
    assetDetail: 'high',
    gtao: true,
    bloom: true,
    grain: true,
    terrainDensity: 'full',
  },
};

export function getStoredQuality() {
  try {
    const val = window.localStorage?.getItem(QUALITY_KEY);
    if (val && ['auto', 'low', 'balanced', 'high'].includes(val)) return val;
  } catch {
    // Storage access refused
  }
  return 'auto';
}

export function setStoredQuality(quality) {
  try {
    window.localStorage?.setItem(QUALITY_KEY, quality);
  } catch {
    // Storage access refused
  }
}

export function detectHardwareBaseline() {
  if (typeof navigator === 'undefined') return 'balanced';
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData) return 'low';
  const cores = navigator.hardwareConcurrency;
  if (cores > 0 && cores <= 2) return 'low';
  return 'balanced';
}

export function resolveQualityProfile(userSetting) {
  const chosen = userSetting || getStoredQuality();
  if (chosen === 'auto') {
    const baseline = detectHardwareBaseline();
    return QUALITY_PROFILES[baseline];
  }
  return QUALITY_PROFILES[chosen] || QUALITY_PROFILES.balanced;
}

// Runtime resolution scale manager. Adapts canvas render scale with strict hysteresis:
// - 3-second warmup window where no downscaling occurs
// - Sustained frame delta > 40ms over 5 seconds decreases scale
// - Sustained frame delta < 22ms over 3 consecutive 5s windows increases scale
// - 10-second cooldown between changes
export function createResolutionManager({ initialScale = 1.0, minScale = 0.6, onScaleChange } = {}) {
  let scale = initialScale;
  let elapsedSinceBoot = 0;
  let cooldownTimer = 0;
  let consecutiveFastWindows = 0;

  let windowTime = 0;
  let windowFrames = 0;
  let windowSlowFrames = 0;
  let windowFastFrames = 0;

  const WARMUP_TIME = 3.0;
  const WINDOW_DURATION = 5.0;
  const COOLDOWN_DURATION = 10.0;
  const SLOW_DT_THRESHOLD = 0.040; // < 25 fps
  const FAST_DT_THRESHOLD = 0.022; // > 45 fps

  function sample(dt) {
    elapsedSinceBoot += dt;
    if (cooldownTimer > 0) cooldownTimer -= dt;

    if (elapsedSinceBoot < WARMUP_TIME) return scale;

    windowTime += dt;
    windowFrames += 1;
    if (dt > SLOW_DT_THRESHOLD) windowSlowFrames += 1;
    if (dt < FAST_DT_THRESHOLD) windowFastFrames += 1;

    if (windowTime >= WINDOW_DURATION) {
      const slowRatio = windowSlowFrames / windowFrames;
      const fastRatio = windowFastFrames / windowFrames;

      if (cooldownTimer <= 0) {
        if (slowRatio > 0.4 && scale > minScale) {
          scale = Math.max(minScale, Number((scale - 0.15).toFixed(2)));
          cooldownTimer = COOLDOWN_DURATION;
          consecutiveFastWindows = 0;
          onScaleChange?.(scale);
        } else if (fastRatio > 0.85 && scale < 1.0) {
          consecutiveFastWindows += 1;
          if (consecutiveFastWindows >= 3) {
            scale = Math.min(1.0, Number((scale + 0.15).toFixed(2)));
            cooldownTimer = COOLDOWN_DURATION;
            consecutiveFastWindows = 0;
            onScaleChange?.(scale);
          }
        } else {
          consecutiveFastWindows = 0;
        }
      }

      windowTime = 0;
      windowFrames = 0;
      windowSlowFrames = 0;
      windowFastFrames = 0;
    }

    return scale;
  }

  return {
    sample,
    getScale: () => scale,
    reset: () => {
      elapsedSinceBoot = 0;
      cooldownTimer = 0;
      consecutiveFastWindows = 0;
      windowTime = 0;
      windowFrames = 0;
    },
  };
}
