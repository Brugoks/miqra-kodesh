// Bone-socket attachment helpers for nearby skeletal humans. Static prop
// resources stay owned by the scene asset session; each actor only owns the
// lightweight scene-graph clone parented under one of its cloned bones.

import { RIG_DEFINITIONS } from './sceneHumanManifest.js';

function applyScale(object, scale) {
  if (Array.isArray(scale)) object.scale.set(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1);
  else object.scale.setScalar(scale ?? 1);
}

export function resolveHumanSocket(THREE, actorRoot, rigId, socketName) {
  const rig = RIG_DEFINITIONS[rigId];
  const socket = rig?.sockets?.[socketName];
  if (!socket?.bone) return null;
  const boneName = THREE.PropertyBinding.sanitizeNodeName(socket.bone);
  return actorRoot.getObjectByName(boneName) || null;
}

export function attachHumanProp(THREE, actorRoot, rigId, spec, modelScene) {
  if (!spec?.modelId || !spec?.socket || !modelScene) return null;
  const socket = resolveHumanSocket(THREE, actorRoot, rigId, spec.socket);
  if (!socket) return null;

  const prop = modelScene.clone(true);
  prop.name = `human-prop-${spec.modelId}`;
  const position = spec.position || [0, 0, 0];
  const rotation = spec.rotation || [0, 0, 0];
  prop.position.set(position[0] || 0, position[1] || 0, position[2] || 0);
  prop.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0, spec.rotationOrder || 'XYZ');
  applyScale(prop, spec.scale);
  prop.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  socket.add(prop);
  return prop;
}

export function isCarryAttachment(spec) {
  return ['leftGrip', 'rightGrip', 'shoulderStrap', 'back'].includes(spec?.socket);
}
