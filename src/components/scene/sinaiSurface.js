import { PATHS } from './sinaiDimensions';
const pathSegments = PATHS.flatMap((points) => points.slice(1).map((b, i) => [points[i], b]));
export function sinaiSurface(material, { paths = false, cliff = false } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNatural;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
          vec4 naturalPos=vec4(position,1.0);
          #ifdef USE_INSTANCING
            naturalPos=instanceMatrix*naturalPos;
          #endif
          vNatural=(modelMatrix*naturalPos).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
          varying vec3 vNatural;
          float soilHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
          float soilNoise(vec2 p) {
            vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
            return mix(mix(soilHash(i),soilHash(i+vec2(1,0)),f.x),
              mix(soilHash(i+vec2(0,1)),soilHash(i+vec2(1,1)),f.x),f.y);
          }
          float trackDistance(vec2 p,vec2 a,vec2 b) {
            vec2 v=b-a; return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));
          }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
          vec2 soilUv=vNatural.xz${cliff ? '+vec2(vNatural.y*.4,vNatural.y)' : ''};
          float soilPatch=soilNoise(soilUv*.32)*.6+soilNoise(soilUv*1.8)*.4;
          float grit=soilNoise(soilUv*28.);
          float nearby=1.-smoothstep(12.,60.,length(vViewPosition));
          diffuseColor.rgb*=.76+soilPatch*.42+(grit-.5)*.13*nearby;
          ${
            cliff
              ? `float granite=soilNoise(soilUv*.9+vec2(vNatural.y*.2));
            diffuseColor.rgb*=.86+granite*.23;`
              : ''
          }
          ${
            paths
              ? `float track=10000.;
            ${pathSegments.map(([a, b]) => `track=min(track,trackDistance(vNatural.xz,vec2(${a.map((v) => v.toFixed(1)).join(',')}),vec2(${b.map((v) => v.toFixed(1)).join(',')})));`).join('\n')}
            float worn=1.-smoothstep(1.5,3.4,track+(soilNoise(soilUv*2.)-.5)*.7);
            diffuseColor.rgb*=mix(vec3(.91,.95,.82),vec3(1.15,1.08,.97),worn);`
              : ''
          }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
          float relief=soilNoise(soilUv*${cliff ? '2.4' : '4.'})*.8+grit*.2;
          vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
          vec3 r1=cross(sy,normal),r2=cross(normal,sx);
          float det=dot(sx,r1);
          normal=normalize(abs(det)*normal-sign(det)*(dFdx(relief)*r1+dFdy(relief)*r2)*${cliff ? '.08' : '.025'}*nearby);`,
      );
  };
  material.customProgramCacheKey = () => `sinai-natural-${paths}-${cliff}`;
  return material;
}
