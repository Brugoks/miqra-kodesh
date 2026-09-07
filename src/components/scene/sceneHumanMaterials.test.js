import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createSkinMaterial,
  createEyeMaterial,
  createHairMaterial,
  createClothMaterial,
  createLeatherMaterial,
  prepareHumanMaterials,
} from './sceneHumanMaterials';

describe('sceneHumanMaterials', () => {
  it('enforces dielectric physical properties for skin (metalness = 0)', () => {
    const skinMat = createSkinMaterial(THREE, { color: 0xba8c68 });
    expect(skinMat.metalness).toBe(0.0);
    expect(skinMat.roughness).toBeGreaterThanOrEqual(0.6);
    expect(skinMat.roughness).toBeLessThanOrEqual(0.85);
    expect(skinMat.aoMapIntensity).toBeLessThanOrEqual(0.7);
  });

  it('configures eye material with high corneal specular response', () => {
    const eyeMat = createEyeMaterial(THREE);
    expect(eyeMat.metalness).toBe(0.0);
    expect(eyeMat.roughness).toBeLessThan(0.2);
  });

  it('configures hair material with alphaTest for crisp cutouts and depth write', () => {
    const hairMat = createHairMaterial(THREE);
    expect(hairMat.alphaTest).toBe(0.5);
    expect(hairMat.depthWrite).toBe(true);
    expect(hairMat.transparent).toBe(false);
    expect(hairMat.side).toBe(THREE.DoubleSide);
  });

  it('configures woven cloth with coarse textile roughness', () => {
    const clothMat = createClothMaterial(THREE);
    expect(clothMat.roughness).toBeGreaterThan(0.85);
    expect(clothMat.metalness).toBeLessThan(0.05);
  });

  it('configures leather material with appropriate leather sheen', () => {
    const leatherMat = createLeatherMaterial(THREE);
    expect(leatherMat.roughness).toBeCloseTo(0.62);
    expect(leatherMat.metalness).toBe(0);
  });

  it('preserves imported texture maps while fixing hair depth sorting', () => {
    const map = new THREE.Texture();
    const hair = new THREE.MeshStandardMaterial({ map, transparent: true, metalness: 0.4 });
    hair.name = 'Hair.001';
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.PlaneGeometry(), hair));
    prepareHumanMaterials(root);
    expect(hair.map).toBe(map);
    expect(hair.transparent).toBe(false);
    expect(hair.alphaTest).toBe(0.4);
    expect(hair.depthWrite).toBe(true);
    expect(hair.metalness).toBe(0);
  });
});
