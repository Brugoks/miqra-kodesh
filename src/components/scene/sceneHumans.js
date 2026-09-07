// Near crowds use textured skeletal assets; distant crowds retain their instanced
// fallback. Assets own shared geometry/materials, this manager owns cloned rigs.
import { SCENE_HUMAN_PLACEMENTS } from './sceneHumanPlacements.js';
import { HUMAN_VARIANTS, CROWD_VARIANTS } from './sceneHumanManifest.js';
import { HumanAnimationController } from './sceneHumanAnimation.js';
import { prepareHumanMaterials } from './sceneHumanMaterials.js';
import { cloneSkinnedMesh } from './sceneResources.js';
import { routePlan, sampleRoute } from './sceneRoutes.js';
import { buildHumanClips } from './sceneHumanClips.js';
import { createPoseOverlay } from './sceneHumanPose.js';
import { attachHumanProp, isCarryAttachment } from './sceneHumanAttachments.js';

const LIMITS = { low: 8, balanced: 18, high: 28 };
const RANGE = { low: 18, balanced: 28, high: 36 };
const qualityName = (value) => value?.name || value || 'balanced';

// Same route model as the instanced fallback (sceneRoutes.js), including
// phase and lane, plus the instantaneous walking speed a caller needs to
// drive gait without differencing positions frame to frame.
export function sampleHumanPosition(placement, elapsed = 0) {
  const [x, y, z] = placement.position;
  const facing = placement.facing || 0;
  if (!placement.route) return {
    x, y, z, facing, speed: 0, moving: false,
  };
  if (!placement.__routePlan) placement.__routePlan = routePlan(placement);
  const sample = sampleRoute(placement.__routePlan, elapsed);
  return {
    x: sample.x, y, z: sample.z, facing: sample.facing, speed: sample.speed, moving: sample.moving,
  };
}

export function createSceneHumans({
  sceneSlug, THREE, root, groundAt, floorAt, crowdFigures,
  qualityProfile = 'balanced', reducedMotion = false, onFallbackSuppressed = null,
} = {}) {
  const authoredByFallback = new Map(
    (SCENE_HUMAN_PLACEMENTS[sceneSlug] || [])
      .filter((placement) => placement.fallbackId)
      .map((placement) => [placement.fallbackId, placement]),
  );

  // Replace the figures where they actually stand, including elevated courts.
  // Never move a fallback to unrelated hand-entered coordinates. Authored
  // metadata may enrich a real crowd descriptor (role, activity and props),
  // but the live crowd keeps authority over position, route, phase and speed.
  const placements = crowdFigures ? crowdFigures.map((figure, index) => {
    const authored = authoredByFallback.get(figure.id);
    return {
      ...figure,
      id: `human-${figure.id}`,
      fallbackId: figure.id,
      variantId: authored?.variantId || CROWD_VARIANTS[index % CROWD_VARIANTS.length],
      activity: authored?.activity || figure.activity,
      props: authored?.props || figure.props || [],
      position: [figure.x || 0, figure.y || 0, figure.z || 0],
    };
  }) : (SCENE_HUMAN_PLACEMENTS[sceneSlug] || []);
  const actors = new Map();
  const models = new Map();
  const propModels = new Map();
  const requiredPropIds = new Set(placements.flatMap((placement) => (placement.props || []).map((prop) => prop.modelId)));

  // Shared local stool parts support seated people instead of leaving them in
  // an invisible chair pose. These small props are owned by this manager.
  let stoolParts = null;
  function addSeat(actorRoot) {
    stoolParts ||= {
      seat: new THREE.CylinderGeometry(0.27, 0.27, 0.05, 16),
      leg: new THREE.CylinderGeometry(0.023, 0.027, 0.49, 6),
      material: new THREE.MeshStandardMaterial({ color: 0x68513b, roughness: 0.94 }),
    };
    const seat = new THREE.Mesh(stoolParts.seat, stoolParts.material);
    seat.position.set(0, 0.5, -0.05); seat.castShadow = true; seat.receiveShadow = true;
    actorRoot.add(seat);
    for (let index = 0; index < 3; index++) {
      const angle = index * Math.PI * 2 / 3;
      const leg = new THREE.Mesh(stoolParts.leg, stoolParts.material);
      leg.position.set(Math.cos(angle) * 0.18, 0.245, Math.sin(angle) * 0.18 - 0.05);
      leg.castShadow = true; actorRoot.add(leg);
    }
  }
  const group = new THREE.Group();
  group.name = `${sceneSlug}-humans-root`;
  root.add(group);
  let currentQuality = qualityName(qualityProfile);
  let disposed = false;
  let clock = 0;
  let previousElapsed = null;
  const cameraPosition = new THREE.Vector3();

  function suppress(actor, value) {
    if (actor.suppressedFallback === value) return;
    actor.suppressedFallback = value;
    if (actor.placement.fallbackId) onFallbackSuppressed?.(actor.placement.fallbackId, value);
  }

  function attachActorProps(actor) {
    if (!actor.root || !actor.placement.props?.length) return;
    actor.attachments ||= new Map();
    actor.placement.props.forEach((spec, index) => {
      const key = `${index}:${spec.modelId}:${spec.socket}`;
      if (actor.attachments.has(key)) return;
      const model = propModels.get(spec.modelId);
      if (!model?.scene) return;
      const attached = attachHumanProp(THREE, actor.root, actor.variant.rigId, spec, model.scene);
      if (attached) actor.attachments.set(key, attached);
    });
  }

  function instantiate(actor) {
    if (actor.root) return;
    const model = models.get(actor.variant.modelId) || models.get(actor.placement.id);
    if (!model?.scene) return;
    const actorRoot = cloneSkinnedMesh(model.scene);
    actorRoot.name = actor.id;
    actorRoot.scale.setScalar(actor.placement.scale || 1);
    actorRoot.position.copy(actor.currentPosition);
    actorRoot.rotation.y = actor.facing;
    const lodMeshes = [[], []];
    actorRoot.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      // Skeletal animation can leave bind-pose bounds. Only the bounded nearby
      // pool renders; avoid unreliable per-limb frustum culling.
      child.frustumCulled = false;
      lodMeshes[child.name.includes('_LOD1') ? 1 : 0].push(child);
    });
    const mixer = new THREE.AnimationMixer(actorRoot);
    // Procedural clips (sceneHumanClips.js) whenever the rig has the bones
    // they need — every shipped character does. Baked GLB clips are the
    // fallback, used only when it doesn't (a test's minimal mock skeleton,
    // or a future asset without the full rig) — the baked `walk` and `idle`
    // clips are not trustworthy on their own; see the plan's §1.4-1.6.
    const clips = (model.__proceduralClips && Object.keys(model.__proceduralClips).length > 0)
      ? model.__proceduralClips
      : Object.fromEntries(
        Object.entries(actor.variant.clips)
          .map(([semantic, name]) => [semantic, model.animations?.find((candidate) => candidate.name === name)])
          .filter(([, clip]) => clip),
      );
    const animController = new HumanAnimationController({ mixer, clips, locomotion: actor.variant.locomotion });
    const activity = actor.placement.activity;
    const carriesProp = actor.placement.props?.some(isCarryAttachment) || false;
    animController.restAction = carriesProp && clips.carry ? 'carry'
      : activity === 'working' ? 'work'
      : activity === 'sitting' ? 'sit' : activity === 'kneeling' ? 'kneel'
      : activity === 'talking' ? 'talk' : activity === 'attending' ? 'listen' : activity === 'carrying' ? 'carry'
      : ['praying', 'bowing'].includes(activity) ? 'prayer' : 'idle';
    if (!clips[animController.restAction]) animController.restAction = 'idle';
    if (animController.restAction === 'sit') addSeat(actorRoot);
    animController.currentFacing = actor.facing;
    animController.transitionTo(animController.restAction, 0);
    // Desynchronize people, and evaluate a clothed, relaxed pose before showing.
    mixer.update((actor.placement.phase || placements.indexOf(actor.placement) * 0.37) % 3 + 0.01);
    const poseOverlay = createPoseOverlay(THREE, actorRoot, { actorId: actor.id, holdPose: carriesProp });
    Object.assign(actor, {
      root: actorRoot, mixer, animController, lodMeshes, poseOverlay,
      attachments: new Map(), carriesProp,
    });
    group.add(actorRoot);
    attachActorProps(actor);
  }

  function acceptAssets(assetGroup) {
    if (disposed || !assetGroup) return;
    for (const [id, model] of Object.entries(assetGroup.models || {})) {
      let skinned = false;
      model?.scene?.traverse((node) => { if (node.isSkinnedMesh) skinned = true; });
      // A primitive GLB or failed model must never suppress a working fallback.
      if (skinned && model.animations?.some((clip) => clip.name === 'idle')) {
        prepareHumanMaterials(model.scene);
        // Built once per model — every clone (one per actor sharing this
        // asset) shares the same bind pose and rig topology, so there is
        // nothing actor-specific to rebuild.
        model.__proceduralClips = buildHumanClips(THREE, model.scene);
        models.set(id, model);
      }
    }
    for (const placement of placements) {
      if (actors.has(placement.id)) continue;
      const variant = HUMAN_VARIANTS[placement.variantId];
      if (!variant || (!models.has(variant.modelId) && !models.has(placement.id))) continue;
      const point = sampleHumanPosition(placement, clock);
      const actor = {
        id: placement.id, placement, variant, root: null,
        currentPosition: new THREE.Vector3(point.x, point.y, point.z),
        facing: point.facing, lodLevel: 1, suppressedFallback: false, wasActive: false,
      };
      actors.set(placement.id, actor);
      if (!crowdFigures) { instantiate(actor); suppress(actor, true); }
    }
  }

  // Prop groups can arrive after the higher-priority actor group. Keep the
  // shared GLB resources in the asset session and attach scene-graph clones to
  // any actor that already exists; actors instantiated later pick them up too.
  function acceptPropAssets(assetGroup) {
    if (disposed || !assetGroup) return;
    for (const [id, model] of Object.entries(assetGroup.models || {})) {
      if (requiredPropIds.has(id) && model?.scene) propModels.set(id, model);
    }
    actors.forEach(attachActorProps);
  }

  function update({ elapsed = 0, delta = 0.016, camera = null, quality = currentQuality, reducedMotion: rm = reducedMotion } = {}) {
    if (disposed) return;
    currentQuality = qualityName(quality);
    const dt = Math.min(Math.max(delta, 0), 0.1);
    // Freeze routes as well as skeletons for reduced motion. Track a separate
    // clock so resuming cannot teleport people to the wall-clock route position.
    if (previousElapsed === null) clock = rm ? 0 : elapsed;
    else if (!rm) clock += Math.max(0, Math.min(elapsed - previousElapsed, 0.1));
    previousElapsed = elapsed;
    if (camera) camera.getWorldPosition ? camera.getWorldPosition(cameraPosition) : cameraPosition.copy(camera.position);
    const sorted = [];
    for (const actor of actors.values()) {
      const point = sampleHumanPosition(actor.placement, clock);
      // The route's own instantaneous speed, not a difference of positions —
      // differencing reports zero on the frame an actor first becomes active
      // (currentPosition still holds its very first placement), which used to
      // snap a walker to its rest pose for a frame every time it re-entered
      // the near pool. See the plan's §5.3.
      actor.distanceMoved = point.moving ? point.speed * dt : 0;
      const floor = floorAt?.(point.x, point.z, actor.currentPosition.y);
      const ground = typeof floor === 'number' ? floor : floor?.height ?? floor?.y;
      point.y = Number.isFinite(ground) ? ground : groundAt?.(point.x, point.z, actor.placement) ?? point.y;
      actor.currentPosition.set(point.x, point.y, point.z);
      actor.facing = point.facing;
      sorted.push({ actor, distance: actor.currentPosition.distanceTo(cameraPosition) });
    }
    sorted.sort((a, b) => a.distance - b.distance);
    const limit = LIMITS[currentQuality] || LIMITS.balanced;
    const range = RANGE[currentQuality] || RANGE.balanced;
    let nearCount = 0;
    const nearLimit = currentQuality === 'high' ? 4 : currentQuality === 'balanced' ? 2 : 0;
    sorted.forEach(({ actor, distance }, index) => {
      const active = index < limit && distance < range + (actor.wasActive ? 3 : 0);
      if (active) instantiate(actor);
      if (!actor.root) return;
      actor.root.visible = active;
      suppress(actor, active);
      if (!active) { actor.wasActive = false; return; }
      const nearThreshold = actor.lodLevel === 0 ? 9 : 7;
      actor.lodLevel = nearCount < nearLimit && distance < nearThreshold ? 0 : 1;
      if (actor.lodLevel === 0) nearCount += 1;
      const level = actor.lodMeshes[1].length ? actor.lodLevel : 0;
      actor.lodMeshes.forEach((meshes, lod) => meshes.forEach((mesh) => { mesh.visible = lod === level; }));
      actor.root.position.copy(actor.currentPosition);
      actor.animController.reducedMotion = rm;
      if (!rm) {
        actor.animController.update(dt, actor.distanceMoved, actor.facing);
        actor.mixer.update(dt);
        // The overlay nudges bones the mixer just set fresh from the clip —
        // always after it, never before, so there is nothing to reset each
        // frame; the mixer overwrites first regardless.
        if (actor.poseOverlay) {
          const dx = cameraPosition.x - actor.currentPosition.x;
          const dz = cameraPosition.z - actor.currentPosition.z;
          let yaw = Math.atan2(dx, dz) - actor.animController.currentFacing;
          while (yaw > Math.PI) yaw -= Math.PI * 2;
          while (yaw < -Math.PI) yaw += Math.PI * 2;
          actor.poseOverlay.update(dt, elapsed, {
            player: { yaw, distance: Math.hypot(dx, dz) },
          });
        }
      }
      actor.root.rotation.y = actor.animController.currentFacing;
      actor.wasActive = true;
    });
  }

  function queryClearance(playerX, playerZ, radius = 0.5, playerY = null) {
    for (const actor of actors.values()) {
      if (!actor.root?.visible) continue;
      if (playerY !== null && Math.abs(playerY - actor.currentPosition.y) > 2.1) continue;
      const dx = playerX - actor.currentPosition.x; const dz = playerZ - actor.currentPosition.z;
      const distance = Math.hypot(dx, dz); const combined = radius + 0.3;
      if (distance < combined) return { collides: true,
        pushX: distance > 0.001 ? dx / distance * (combined - distance) : combined,
        pushZ: distance > 0.001 ? dz / distance * (combined - distance) : 0 };
    }
    return { collides: false, pushX: 0, pushZ: 0 };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const skeletons = new Set();
    for (const actor of actors.values()) {
      suppress(actor, false);
      actor.animController?.dispose();
      actor.mixer?.stopAllAction();
      if (actor.root) {
        actor.mixer?.uncacheRoot(actor.root);
        actor.root.traverse((child) => { if (child.skeleton) skeletons.add(child.skeleton); });
      }
    }
    skeletons.forEach((skeleton) => skeleton.dispose());
    actors.clear(); models.clear(); propModels.clear(); root.remove(group);
    if (stoolParts) Object.values(stoolParts).forEach((resource) => resource.dispose());
  }
  return { group, acceptAssets, acceptPropAssets, update, queryClearance, dispose,
    setQuality: (profile) => { currentQuality = qualityName(profile); },
    getActors: () => actors, getElapsed: () => clock };
}
