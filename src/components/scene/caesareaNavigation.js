import { BOUNDS, GROUND, BUILDINGS, COLUMNS, PALMS, CARGO } from './caesareaDimensions';
const R = 0.45;
export const BARRIERS = {
  edge: { id: 'waterfront-edge', label: 'The Edge of the Walkable District', body: 'The harbor is a route for ships, not for walking. This compact reconstruction ends at the quay and the district boundaries. Paul’s journey continues by sea in Acts 27.', refs: ['Acts 27:1-6'] },
  palace: { id: 'palace-boundary', label: 'The Governor’s Precinct', body: 'The facade is an illustrative boundary, not an accessible reconstruction of Paul’s cell. Acts places him in Herod’s praetorium but does not describe the room.', refs: ['Acts 23:35'] },
};
export function floorAt(x, z) {
  return Number.isFinite(x) && Number.isFinite(z) && x >= BOUNDS.x0 + R && x <= BOUNDS.x1 - R && z >= BOUNDS.z0 + R && z <= BOUNDS.z1 - R
    ? { height: GROUND, region: 'waterfront' } : null;
}
export function blockerAt(x, z) {
  for (const b of BUILDINGS) if (x > b.x0 - R && x < b.x1 + R && z > b.z0 - R && z < b.z1 + R) return b.id;
  for (const c of COLUMNS) if (Math.hypot(x - c.x, z - c.z) < c.radius + R + 0.2) return 'column';
  for (const p of PALMS) if (Math.hypot(x - p.x, z - p.z) < 0.55 + R) return 'palm';
  for (const c of CARGO) if (Math.abs(x - c.x) < c.w / 2 + R && Math.abs(z - c.z) < c.d / 2 + R) return 'cargo';
  return null;
}
export function stanceAt(x, z) {
  const floor = floorAt(x, z);
  return floor && !blockerAt(x, z) ? { x, z, ...floor, blocked: null } : null;
}
// Bounded substeps prevent a long frame or a caller's large delta tunnelling
// through a warehouse. Per-axis sliding keeps the quay comfortable to walk.
export function move(from, dx, dz) {
  if (!from || !Number.isFinite(dx) || !Number.isFinite(dz)) return from;
  const distance = Math.hypot(dx, dz);
  const count = Math.max(1, Math.ceil(Math.min(distance, 1000) / 0.2));
  const scale = distance > 1000 ? 1000 / distance : 1;
  const sx = dx * scale / count, sz = dz * scale / count;
  let p = { ...from, blocked: null };
  let blocked = null;
  for (let i = 0; i < count; i += 1) {
    const next = stanceAt(p.x + sx, p.z + sz);
    if (next) { p = next; continue; }
    blocked = blockerAt(p.x + sx, p.z + sz) || 'edge';
    const slide = (sx && stanceAt(p.x + sx, p.z)) || (sz && stanceAt(p.x, p.z + sz));
    if (!slide) break;
    p = slide;
  }
  return { ...p, blocked };
}
export function groundPointAlongRay(origin, direction, maxDistance = 340) {
  if (direction.y >= 0) return null;
  const t = (GROUND - origin.y) / direction.y;
  if (!Number.isFinite(t) || t < 0 || t > maxDistance) return null;
  return stanceAt(origin.x + direction.x * t, origin.z + direction.z * t);
}
