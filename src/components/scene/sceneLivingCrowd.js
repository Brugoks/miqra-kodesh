import { createCrowd } from './sceneFigures';
import { createSceneHumans } from './sceneHumans';
import { createInstancedCrowd } from './sceneInstancedHumans';
import { assignCrowdMotion } from './sceneMixamo';

// The same people at every distance: a small pool of full rigs near the visitor,
// captured poses in an instanced crowd beyond it, and a loading fallback.
export function createLivingCrowd(THREE, { root, figures, sceneSlug, groundAt, quality, reducedMotion, motionLibrary, active = () => true }) {
  figures.forEach(assignCrowdMotion);
  const group = new THREE.Group();
  group.name = `${sceneSlug}-daily-life`;
  root.add(group);
  const fallback = createCrowd(THREE, { figures, groundAt, quality });
  group.add(fallback.group);
  const near = new Set();
  const distant = createInstancedCrowd(THREE, {
    figures, groundAt, quality, motionLibrary,
    name: `${sceneSlug}-living-crowd`,
    onReach: (id, inReach) => fallback.suppress(id, inReach || near.has(id)),
    onBuilt: () => { if (!Number.isFinite(distant.reach)) fallback.group.visible = false; },
  });
  group.add(distant.group);
  const humans = createSceneHumans({
    THREE, root: group, sceneSlug, crowdFigures: figures, groundAt,
    qualityProfile: quality, reducedMotion, motionLibrary,
    actorLimits: { low: 3, balanced: 5, high: 8 },
    actorRange: { low: 10, balanced: 12, high: 15 },
    onFallbackSuppressed: (id, value) => {
      if (value) near.add(id); else near.delete(id);
      distant.suppress(id, value);
      fallback.suppress(id, value || distant.inReach(id));
    },
  });
  return {
    group, figures,
    getActors: humans.getActors,
    getElapsed: humans.getElapsed,
    update(frame) {
      group.visible = active();
      if (!group.visible) return;
      humans.update(frame);
      distant.update(humans.getElapsed(), frame.camera?.position);
      if (!distant.ready || Number.isFinite(distant.reach)) fallback.update(humans.getElapsed());
    },
    acceptAssets(assets) {
      humans.acceptAssets(assets);
      if (distant.acceptAssets(assets) && !Number.isFinite(distant.reach)) fallback.group.visible = false;
    },
    setQuality: humans.setQuality,
    queryClearance: (...args) => active() ? humans.queryClearance(...args) : { collides: false, pushX: 0, pushZ: 0 },
    dispose() { humans.dispose(); distant.dispose(); fallback.dispose(); root.remove(group); },
  };
}
