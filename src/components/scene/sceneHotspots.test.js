import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createHotspotOcclusionManager } from './sceneHotspots';

describe('sceneHotspots occlusion', () => {
  it('detects occlusion when an opaque wall sits between camera and target', () => {
    // Camera at [0, 1.7, 0], Target at [0, 1.7, 10]
    // Wall slab at [0, 1.7, 5] with thickness 1.0, width 4.0, height 4.0
    const wallGeom = new THREE.BoxGeometry(4, 4, 1);
    const wallMat = new THREE.MeshBasicMaterial();
    const wall = new THREE.Mesh(wallGeom, wallMat);
    wall.position.set(0, 1.7, 5);
    wall.updateMatrixWorld(true);

    const manager = createHotspotOcclusionManager([wall]);
    const cameraPos = new THREE.Vector3(0, 1.7, 0);
    const targetPos = new THREE.Vector3(0, 1.7, 10);

    expect(manager.isOccluded(cameraPos, targetPos)).toBe(true);
  });

  it('allows line of sight when wall is off to the side', () => {
    const wallGeom = new THREE.BoxGeometry(4, 4, 1);
    const wallMat = new THREE.MeshBasicMaterial();
    const wall = new THREE.Mesh(wallGeom, wallMat);
    wall.position.set(10, 1.7, 5); // off-center
    wall.updateMatrixWorld(true);

    const manager = createHotspotOcclusionManager([wall]);
    const cameraPos = new THREE.Vector3(0, 1.7, 0);
    const targetPos = new THREE.Vector3(0, 1.7, 10);

    expect(manager.isOccluded(cameraPos, targetPos)).toBe(false);
  });

  it('does not self-occlude target on wall surface due to endpoint tolerance', () => {
    // Wall at [0, 1.7, 5], thickness 0.4 (front face at z = 4.8)
    // Hotspot sitting at z = 4.85 (right on the wall face)
    const wallGeom = new THREE.BoxGeometry(4, 4, 0.4);
    const wall = new THREE.Mesh(wallGeom, new THREE.MeshBasicMaterial());
    wall.position.set(0, 1.7, 5);
    wall.updateMatrixWorld(true);

    const manager = createHotspotOcclusionManager([wall]);
    const cameraPos = new THREE.Vector3(0, 1.7, 0);
    const targetPos = new THREE.Vector3(0, 1.7, 4.85);

    expect(manager.isOccluded(cameraPos, targetPos)).toBe(false);
  });

  it('limits evaluated visible hotspots to at most 3 non-overlapping labels', () => {
    const manager = createHotspotOcclusionManager([]);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 1.7, 0);
    camera.lookAt(0, 1.7, 20);
    camera.updateMatrixWorld(true);

    // 5 hotspots lined up ahead
    const hotspots = [
      { id: 'h1', position: [-2, 1.7, 10], maxDistance: 50 },
      { id: 'h2', position: [2, 1.7, 12], maxDistance: 50 },
      { id: 'h3', position: [0, 2.5, 15], maxDistance: 50 },
      { id: 'h4', position: [-4, 1.7, 18], maxDistance: 50 },
      { id: 'h5', position: [4, 1.7, 20], maxDistance: 50 },
    ];

    const accepted = manager.evaluateHotspots({
      camera,
      hotspots,
      width: 1000,
      height: 800,
      activeId: 'h5', // active should be prioritized even if far
    });

    expect(accepted.size).toBeLessThanOrEqual(3);
    expect(accepted.has('h5')).toBe(true);
  });
});
