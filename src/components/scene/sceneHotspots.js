// Hotspot visibility, occlusion, and layout prioritization engine.
// Performs distance, frustum, and raycast occlusion checks against scene occluders
// with endpoint tolerance to prevent wall-anchored pins from hiding themselves.
// Prioritizes active selection, distance, and non-overlapping labels (max 3).

import * as THREE from 'three';

export function createHotspotOcclusionManager(occluders = []) {
  const raycaster = new THREE.Raycaster();
  const dir = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const anchor = new THREE.Vector3();

  // Endpoint tolerance (0.3m) prevents a label mounted on a wall surface
  // from occluding itself.
  const ENDPOINT_TOLERANCE = 0.3;
  const MAX_VISIBLE_LABELS = 3;

  function isOccluded(cameraPos, targetPos) {
    if (!occluders || occluders.length === 0) return false;
    dir.subVectors(targetPos, cameraPos);
    const totalDist = dir.length();
    if (totalDist <= ENDPOINT_TOLERANCE) return false;

    dir.normalize();
    raycaster.set(cameraPos, dir);
    raycaster.near = 0.4;
    raycaster.far = Math.max(0.5, totalDist - ENDPOINT_TOLERANCE);

    const hits = raycaster.intersectObjects(occluders, true);
    return hits.length > 0;
  }

  function evaluateHotspots({
    camera,
    hotspots = [],
    width,
    height,
    activeId = null,
    previouslyVisible = new Set(),
  }) {
    if (!camera || !width || !height) return new Map();

    const candidates = [];

    for (const spot of hotspots) {
      anchor.set(...spot.position);
      const dist = camera.position.distanceTo(anchor);

      // Hysteresis: allow 5% extra distance if already visible to prevent boundary chatter
      const threshold = previouslyVisible.has(spot.id)
        ? spot.maxDistance * 1.05
        : spot.maxDistance;

      if (dist > threshold) continue;

      projected.copy(anchor).project(camera);
      // Behind camera
      if (projected.z > 1) continue;

      const screenX = (projected.x * 0.5 + 0.5) * width;
      const screenY = (-projected.y * 0.5 + 0.5) * height;

      // Screen margin bounds check
      const onScreen = screenX > 30 && screenX < width - 30 && screenY > 40 && screenY < height - 40;
      if (!onScreen) continue;

      // Raycast wall occlusion
      if (isOccluded(camera.position, anchor)) continue;

      candidates.push({
        id: spot.id,
        x: screenX,
        y: screenY,
        distance: dist,
        isActive: spot.id === activeId,
      });
    }

    // Sort: active first, then nearest
    candidates.sort((a, b) => {
      if (a.isActive) return -1;
      if (b.isActive) return 1;
      return a.distance - b.distance;
    });

    // Overlap suppression (simple distance rejection between pins on screen)
    const accepted = new Map();
    const MIN_SCREEN_SEPARATION = 55; // pixels

    for (const cand of candidates) {
      if (accepted.size >= MAX_VISIBLE_LABELS && !cand.isActive) break;

      let overlaps = false;
      for (const [, placed] of accepted) {
        const dx = cand.x - placed.x;
        const dy = cand.y - placed.y;
        if (Math.hypot(dx, dy) < MIN_SCREEN_SEPARATION) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps || cand.isActive) {
        accepted.set(cand.id, { x: cand.x, y: cand.y, distance: cand.distance });
      }
    }

    return accepted;
  }

  return {
    isOccluded,
    evaluateHotspots,
  };
}
