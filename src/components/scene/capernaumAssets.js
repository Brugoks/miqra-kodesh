// Scene-specific asset placement for Capernaum: the shared props and the
// skinned people. The core, boat and terrain groups this once handled are
// gone from the manifest — see the note there — so what is left is what is
// actually worth downloading.

import { LEVEL } from './capernaumDimensions';
import { cloneSkinnedMesh } from './sceneResources';

export function createCapernaumAssetManager(built, THREE) {
  const root = built.root;
  const attachedGroups = new Map();

  function applyProps(assetGroup) {
    // The same loaded CC0 prop models can be cloned onto character bones. The
    // asset session retains ownership of their shared geometry/materials.
    built.humans?.acceptPropAssets?.(assetGroup);
    if (attachedGroups.has('props')) return;
    const group = new THREE.Group();
    group.name = 'capernaum-assets-props';

    // Fish net drying on shore
    if (assetGroup.models?.['prop-fish-net']) {
      const net = assetGroup.models['prop-fish-net'].scene.clone();
      net.position.set(5.5, LEVEL.beach, -14.5);
      net.rotation.y = 0.2;
      group.add(net);
    }

    // Stone anchor at water edge
    if (assetGroup.models?.['prop-stone-anchor']) {
      const anchor = assetGroup.models['prop-stone-anchor'].scene.clone();
      anchor.position.set(-4.0, LEVEL.beach, -18.2);
      group.add(anchor);
    }

    // Storage jar in courtyard corner (outside walking corridor)
    if (assetGroup.models?.['prop-galilean-jar']) {
      const jar = assetGroup.models['prop-galilean-jar'].scene.clone();
      jar.position.set(13.8, LEVEL.ground, 22.8);
      group.add(jar);
    }

    // Woven basket in courtyard
    if (assetGroup.models?.['prop-basket']) {
      const basket = assetGroup.models['prop-basket'].scene.clone();
      basket.position.set(17.4, LEVEL.ground, 21.5);
      group.add(basket);
    }

    root.add(group);
    attachedGroups.set('props', group);
  }

  function applyActors(assetGroup) {
    if (built.humans) {
      built.humans.acceptAssets(assetGroup);
      return;
    }
    if (attachedGroups.has('actors')) return;
    const group = new THREE.Group();
    group.name = 'capernaum-assets-actors';

    // 1. Shore fisherman
    if (assetGroup.models?.['actor-fisherman']) {
      const fisherman = cloneSkinnedMesh(assetGroup.models['actor-fisherman'].scene);
      fisherman.position.set(2.0, LEVEL.beach, -18.0);
      fisherman.rotation.y = -0.4;
      group.add(fisherman);
    }

    // 2. Courtyard grinder
    if (assetGroup.models?.['actor-grinder']) {
      const grinder = cloneSkinnedMesh(assetGroup.models['actor-grinder'].scene);
      grinder.position.set(18.2, LEVEL.ground, 22.0);
      grinder.rotation.y = Math.PI * 0.7;
      group.add(grinder);
    }

    // 3. Lane carrier
    if (assetGroup.models?.['actor-carrier']) {
      const carrier = cloneSkinnedMesh(assetGroup.models['actor-carrier'].scene);
      carrier.position.set(12.0, LEVEL.ground, 28.0);
      carrier.rotation.y = -Math.PI * 0.5;
      group.add(carrier);
    }

    root.add(group);
    attachedGroups.set('actors', group);
  }

  function applyGroup(assetGroup) {
    if (!assetGroup) return;
    switch (assetGroup.groupKey) {
      case 'props':
        applyProps(assetGroup);
        break;
      case 'actors':
        applyActors(assetGroup);
        break;
      default:
        break;
    }
  }

  function detach() {
    attachedGroups.forEach((grp) => {
      root.remove(grp);
    });
    attachedGroups.clear();
  }

  return {
    applyGroup,
    detach,
    getAttached: () => attachedGroups,
  };
}
