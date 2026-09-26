// The weather of the lake, shared between everything that has to agree on it.
//
// The water's swell is displaced in a vertex shader, but a boat riding it, a
// mooring rope going slack and taut, and a gull settling on it all need the
// same number on the CPU. Two copies of three sine waves drift apart the first
// time somebody tunes one of them, and a boat that bobs out of step with the
// water under it reads as a boat on a stick — so the swell is defined once
// here, and the shader is generated from the same constants.
//
// Axes are Capernaum's: +X east, +Z north, -Z south out over the lake.

// Three crossed swells. The lake is small and its chop is short; these are the
// numbers the original water shader was tuned to, kept so its look survives.
export const SWELLS = [
  { kx: 0.22, kz: 0, speed: 1.05, amplitude: 0.1 },
  { kx: 0, kz: 0.31, speed: -0.83, amplitude: 0.075 },
  { kx: 0.13, kz: 0.13, speed: 0.5, amplitude: 0.06 },
];

// Height of the swell above the still surface at (x, z) and time t, in metres.
export function swellAt(x, z, t) {
  let height = 0;
  for (const s of SWELLS) height += Math.sin(x * s.kx + z * s.kz + t * s.speed) * s.amplitude;
  return height;
}

// The slope of the swell, for pitching and rolling something that floats on
// it: d(height)/dx and d(height)/dz, written into `out`.
export function swellSlopeAt(x, z, t, out = { x: 0, z: 0 }) {
  let dx = 0;
  let dz = 0;
  for (const s of SWELLS) {
    const c = Math.cos(x * s.kx + z * s.kz + t * s.speed) * s.amplitude;
    dx += c * s.kx;
    dz += c * s.kz;
  }
  out.x = dx;
  out.z = dz;
  return out;
}

// The same function as GLSL, for a vertex shader with `uniform float uTime`.
export const SWELL_GLSL = `
float swellAt(vec2 p, float t) {
  float h = 0.0;
${SWELLS.map((s) => `  h += sin(p.x * ${s.kx.toFixed(4)} + p.y * ${s.kz.toFixed(4)} + t * ${s.speed.toFixed(4)}) * ${s.amplitude.toFixed(4)};`).join('\n')}
  return h;
}
`;

// The morning land breeze: air off the Korazim slope drifting down onto the
// lake, which is why dawn on the Kinneret is usually calm and why smoke from
// the village leans out over the water. The afternoon west wind the lake is
// notorious for (Mark 4:37) is a different animal and not what this scene
// shows. A unit vector on the ground plane, and metres per second.
// Blowing toward a compass heading of 165° — south-south-east, off the slope
// and out over the water.
const WIND_TOWARD = (165 * Math.PI) / 180;
export const WIND = { x: Math.sin(WIND_TOWARD), z: Math.cos(WIND_TOWARD), speed: 1.6 };
