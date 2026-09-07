// Scene-specific asset placement and atomic fallback replacement for Capernaum.
// Connects loaded PBR materials, detailed boat, doorway, props, ridge, and actors
// while strictly preserving floor heights, collision corridors, and navigation bounds.

import { LEVEL } from './capernaumDimensions';
import { cloneSkinnedMesh } from './sceneResources';

export function createCapernaumAssetManager(built, THREE) {
  const root = built.root;
  const attachedGroups = new Map();

  // Find procedural fallbacks to hide when replacement assets arrive
  const fallbackDoorway = root.getObjectByName('insula-doorway-procedural');
  const fallbackBoat = root.getObjectByName('boat-beach-a') || root.getObjectByName('shore-boat-hero');
  const fallbackRidge = root.getObjectByName('ridge-horizon');

  function applyCore(assetGroup) {
    if (attachedGroups.has('core')) return;
    const group = new THREE.Group();
    group.name = 'capernaum-assets-core';

    // 1. Doorway replacement
    if (assetGroup.models?.['model-doorway']) {
      const doorway = assetGroup.models['model-doorway'].scene.clone();
      doorway.position.set(15.6, LEVEL.ground, 17.6);
      doorway.rotation.y = Math.PI;
      group.add(doorway);
      if (fallbackDoorway) fallbackDoorway.visible = false;
    }

    // 2. Apply PBR materials to pilot route surfaces
    if (assetGroup.materials?.['mat-basalt-stone']) {
      const basaltMat = assetGroup.materials['mat-basalt-stone'];
      root.traverse((node) => {
        if (node.isMesh && node.name?.startsWith('insula-wall')) {
          node.material = basaltMat;
        }
      });
    }

    root.add(group);
    attachedGroups.set('core', group);
  }

  function applyBoat(assetGroup) {
    if (attachedGroups.has('boat')) return;
    const group = new THREE.Group();
    group.name = 'capernaum-assets-boat';

    if (assetGroup.models?.['model-ginosar-boat']) {
      const boat = assetGroup.models['model-ginosar-boat'].scene.clone();
      // Primary shore boat location matching vantage 'the-shore'
      boat.position.set(-6.5, LEVEL.beach + 0.1, -17.5);
      boat.rotation.y = 0.35;
      group.add(boat);
      if (fallbackBoat) fallbackBoat.visible = false;
    }

    root.add(group);
    attachedGroups.set('boat', group);
  }

  function applyProps(assetGroup) {
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

  function applyTerrain(assetGroup) {
    if (attachedGroups.has('terrain')) return;
    const group = new THREE.Group();
    group.name = 'capernaum-assets-terrain';

    if (assetGroup.models?.['model-galilee-ridge']) {
      const ridge = assetGroup.models['model-galilee-ridge'].scene.clone();
      ridge.position.set(0, -10, 280);
      group.add(ridge);
      if (fallbackRidge) fallbackRidge.visible = false;
    }

    root.add(group);
    attachedGroups.set('terrain', group);
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
      case 'core':
        applyCore(assetGroup);
        break;
      case 'boat':
        applyBoat(assetGroup);
        break;
      case 'props':
        applyProps(assetGroup);
        break;
      case 'terrain':
        applyTerrain(assetGroup);
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
