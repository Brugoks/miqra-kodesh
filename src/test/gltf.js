// A GLTFLoader for tests that parse the shipped characters. Not a test file, so
// vitest does not run it.
//
// Two things the shipped GLBs need that a bare loader lacks:
//  - the meshopt decoder, because characters are EXT_meshopt_compression files;
//  - headless images. jsdom cannot decode an image, so every texture is replaced with
//    an empty one. The plugin has to come BEFORE the loader's own EXT_texture_webp
//    reader, which would otherwise claim WebP textures and wait forever on jsdom to
//    decode them; plugins run in registration order, so it is put at the front.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export function createTestGltfLoader() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.pluginCallbacks.unshift(() => ({ name: 'HEADLESS_IMAGES', loadTexture: async () => new THREE.Texture() }));
  return loader;
}
