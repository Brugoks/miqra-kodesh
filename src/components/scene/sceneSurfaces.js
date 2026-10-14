// Scanned surfaces for every scene. A scan is projected in metres from the
// world position, so a scaled wall, an instanced beam and a hillside all keep
// the same grain size, and no builder has to author UVs for it. The textures
// are owned by the asset session, never by the builder: this module only
// points a material at them, so disposing the builder cannot free a map the
// session (or another scene's material) is still reading.
//
// The scan is laid *under* whatever the material already does. A material
// with its own `onBeforeCompile` (the Voronoi basalt, the sand ripples, the
// masonry joints) passes `preserveShader`, and its fragment work then runs on
// top of the scanned colour and normal instead of being replaced by them.
// A very dark scan under a vertex-coloured surface (goal: white) asks for a
// large multiplier on purpose; the cap only stops a bad average from blowing a
// surface out instead of correcting it.
const MAX_TINT = 8;
const HASH = `
  float scanHash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float scanNoise(vec2 p){
    vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(scanHash(i),scanHash(i+vec2(1.,0.)),f.x),mix(scanHash(i+vec2(0.,1.)),scanHash(i+vec2(1.,1.)),f.x),f.y);
  }`;

export function applyScannedSurface(THREE, target, source, {
  metres = 2,
  // Colour the surface should average out to once the scan is on it (a hex
  // in sRGB). Omitted: the colour the material already has, which is where
  // most scenes' palettes live. Needs the scan's average, which the generated
  // material index carries; without one the colour is left alone.
  albedo = null,
  // An exact multiplier instead, for a scan with no average on record.
  tint = null,
  preserveShader = false,
  strength = 0.8,
  // Normal-map strength. Rough stone takes more than plaster.
  relief = 0.65,
  // How much of the scan's own colour survives. Below 1 pulls the scan toward
  // a luminance-only grain, which keeps a strongly coloured scan inside the
  // scene's palette; the scans are references for surface, not for colour.
  chroma = 0.45,
  // Large natural surfaces (terrain, cliff, sand) show their tile as a grid.
  // This breaks it: a slow world-space variation in value and hue, and a
  // second diffuse sample at an unrelated scale and angle blended by noise.
  breakTiling = false,
} = {}) {
  if (!source?.map || target.userData.scanned) return false;
  target.userData.scanned = true;
  const previous = preserveShader ? target.onBeforeCompile : null;
  const previousKey = target.customProgramCacheKey();
  for (const key of ['map', 'normalMap', 'roughnessMap']) target[key] = source[key];
  const mean = source.userData?.mean;
  if (tint !== null) target.color.setHex(tint);
  else if (mean) {
    // The scan's contribution averages to `out` (see the shader below), so
    // the multiplier that lands on the palette colour is goal / out.
    const goal = albedo !== null ? new THREE.Color(albedo) : target.color.clone();
    const luma = mean[0] * 0.2126 + mean[1] * 0.7152 + mean[2] * 0.0722;
    const out = mean.map((v) => (1 - strength) * 0.65 + strength * (chroma * v + (1 - chroma) * luma));
    target.color.setRGB(
      Math.min(goal.r / out[0], MAX_TINT), Math.min(goal.g / out[1], MAX_TINT), Math.min(goal.b / out[2], MAX_TINT),
    );
  }
  target.roughness = 1;
  target.normalScale.setScalar(relief);
  target.onBeforeCompile = (shader) => {
    previous?.(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vScannedPosition;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 scanPosition=vec4(position,1.);
        #ifdef USE_INSTANCING
          scanPosition=instanceMatrix*scanPosition;
        #endif
        vScannedPosition=(modelMatrix*scanPosition).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vScannedPosition;${breakTiling ? HASH : ''}`)
      .replace('#include <map_fragment>', `
        vec3 scanNormal=abs(normalize(cross(dFdx(vScannedPosition),dFdy(vScannedPosition))));
        vec2 scanUv=scanNormal.x>scanNormal.z?vScannedPosition.zy:vScannedPosition.xy;
        if(scanNormal.y>max(scanNormal.x,scanNormal.z)) scanUv=vScannedPosition.xz;
        scanUv/=${metres.toFixed(2)};
        ${THREE.ShaderChunk.map_fragment.replaceAll('vMapUv', 'scanUv').replace('diffuseColor *= sampledDiffuseColor;', `
          ${breakTiling ? `
          // Second look at the same scan, turned and stretched, so the repeat
          // never lines up with itself; the blend follows slow world noise.
          vec2 scanFar=mat2(.82,.57,-.57,.82)*scanUv*.37+vec2(.31,.17);
          vec4 scanOther=texture2D(map,scanFar);
          float scanMix=smoothstep(.3,.7,scanNoise(vScannedPosition.xz*.045+vScannedPosition.y*.02));
          sampledDiffuseColor=mix(sampledDiffuseColor,scanOther,scanMix*.55);
          sampledDiffuseColor.rgb*=.86+scanNoise(vScannedPosition.xz*.013)*.28;` : ''}
          float scanLuma=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));
          sampledDiffuseColor.rgb=mix(vec3(scanLuma),sampledDiffuseColor.rgb,${chroma.toFixed(2)});
          sampledDiffuseColor.rgb=mix(vec3(.65),sampledDiffuseColor.rgb,${strength.toFixed(2)});
          diffuseColor *= sampledDiffuseColor;`)}`)
      .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment.replaceAll('vRoughnessMapUv', 'scanUv'))
      .replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          vec3 scanN=texture2D(normalMap,scanUv).xyz*2.-1.;
          scanN.xy*=normalScale;
          normal=normalize(getTangentFrame(-vViewPosition,normal,scanUv)*scanN);
        #endif`);
  };
  target.customProgramCacheKey = () =>
    `scan-v3-${metres}-${strength}-${relief}-${chroma}-${breakTiling ? 'x' : ''}-${preserveShader ? previousKey : ''}`;
  target.needsUpdate = true;
  return true;
}

// Point a scene's materials at the scans its asset group delivered. `loaded` is
// the group's `materials` (id -> material the session built); each binding says
// which scan a builder material wears and how. A scan that failed to load is
// simply absent, and the procedural surface stays as it was. Returns how many
// surfaces took a scan.
export function applyScannedSurfaces(THREE, loaded, slug, bindings, { anisotropy = 1 } = {}) {
  if (!loaded) return 0;
  let applied = 0;
  for (const [target, role, options] of bindings) {
    const source = loaded[`${slug}-${role}`];
    if (!applyScannedSurface(THREE, target, source, options)) continue;
    applied += 1;
    // Ground and paving are seen at a grazing angle; without anisotropic
    // filtering they smear to mush a few metres out. The textures belong to
    // the session, so this only ever raises the setting.
    for (const key of ['map', 'normalMap', 'roughnessMap'])
      if (source[key] && source[key].anisotropy < anisotropy) {
        source[key].anisotropy = anisotropy;
        source[key].needsUpdate = true;
      }
  }
  return applied;
}
