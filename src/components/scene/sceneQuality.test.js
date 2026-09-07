import { describe, it, expect, vi } from 'vitest';
import {
  resolveQualityProfile,
  createResolutionManager,
} from './sceneQuality';

describe('sceneQuality profiles', () => {
  it('resolves explicit quality options correctly', () => {
    expect(resolveQualityProfile('low').name).toBe('low');
    expect(resolveQualityProfile('low').shadowMapSize).toBe(0);

    expect(resolveQualityProfile('balanced').name).toBe('balanced');
    expect(resolveQualityProfile('balanced').shadowMapSize).toBe(1024);

    expect(resolveQualityProfile('high').name).toBe('high');
    expect(resolveQualityProfile('high').gtao).toBe(true);
  });

  it('resolves auto to a valid profile', () => {
    const profile = resolveQualityProfile('auto');
    expect(['low', 'balanced', 'high']).toContain(profile.name);
  });
});

describe('createResolutionManager', () => {
  it('does not downscale during the 3-second warmup window', () => {
    const onScaleChange = vi.fn();
    const manager = createResolutionManager({ initialScale: 1.0, onScaleChange });

    // Feed 2 seconds of 50ms slow frames (should be ignored during warmup)
    for (let i = 0; i < 40; i++) {
      manager.sample(0.05);
    }
    expect(manager.getScale()).toBe(1.0);
    expect(onScaleChange).not.toHaveBeenCalled();
  });

  it('triggers downscaling after sustained slow frames past warmup', () => {
    const onScaleChange = vi.fn();
    const manager = createResolutionManager({ initialScale: 1.0, onScaleChange });

    // Pass warmup: 3.1 seconds of normal 16ms frames
    for (let i = 0; i < 194; i++) {
      manager.sample(0.016);
    }

    // Now 5 seconds of 50ms frames
    for (let i = 0; i < 100; i++) {
      manager.sample(0.05);
    }

    expect(manager.getScale()).toBeLessThan(1.0);
    expect(onScaleChange).toHaveBeenCalledWith(manager.getScale());
  });

  it('observes cooldown and requires consecutive fast windows to upscale', () => {
    const onScaleChange = vi.fn();
    const manager = createResolutionManager({ initialScale: 0.85, onScaleChange });

    // Pass warmup: 3.1 seconds of fast 16ms frames
    for (let i = 0; i < 200; i++) {
      manager.sample(0.016);
    }

    // One fast window (5 seconds of 16ms): should not upscale yet (requires 3)
    for (let i = 0; i < 312; i++) {
      manager.sample(0.016);
    }
    expect(manager.getScale()).toBe(0.85);

    // Two more fast windows (10 seconds)
    for (let i = 0; i < 625; i++) {
      manager.sample(0.016);
    }
    expect(manager.getScale()).toBe(1.0);
  });
});
