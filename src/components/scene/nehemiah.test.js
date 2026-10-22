import { describe, it, expect, afterEach } from 'vitest';
import {
  WALLS, WALL_STATES, EVENT_WALL_STATE, GATE, GATE_INFO, NEHEMIAH_3_GATES, TOWER_INFO, STAIRS, HOUSES, POOLS,
  TEMPLE, MOUNT, BROAD_WALL, WATER_SQUARE, WALK, EVENT_GROUND, CUBIT, STREETS,
  groundAt, shapeGround, insidePolygon, groves, streetDistance,
} from './nehemiahDimensions';
import {
  PROFILES, PROFILE_BY_ID, FEATURES, FEATURE_BY_ID, GATES, TOWERS, STAIR_FLIGHTS,
  frameAt, topAt, ruinHeight, nearestWall, gateAt, wallTopAt, stairAt, arcBetween, circuitLength,
} from './nehemiahWalls';
import {
  BARRIERS, BODY_RADIUS, floorAt, blockerAt, stanceAt, move, setWallState, enclosureAt, regionAt,
} from './nehemiahNavigation';
import { NEHEMIAH } from '../../lib/nehemiahScene';
import { surfaceForRegion } from '../../lib/sceneAudio';

// Nehemiah's Wall holds its geometry against the book it is built from. These
// are the claims that are not matters of taste: ten gates in the order of
// chapter 3, the Valley Gate and the Dung Gate a thousand cubits apart, a
// circuit of about a mile and a half, a wall that is broken, half built, and
// finished as the text says it was at three moments — and then the walking:
// every gate is a way through, the wall is solid where it is drawn solid, the
// stairs reach the walkway and the walkway can be walked.

afterEach(() => setWallState('built'));

const CITY = PROFILE_BY_ID.city;
const MILE = 1609.34;

describe('the circuit of Nehemiah 3', () => {
  it('has the ten gates the chapter names, each in the wall that holds it', () => {
    for (const id of NEHEMIAH_3_GATES) {
      expect(FEATURE_BY_ID[id], id).toBeTruthy();
      expect(FEATURE_BY_ID[id].kind, id).toBe('gate');
      expect(GATE_INFO[id].refs.some((ref) => ref.startsWith('Nehemiah 3:')), id).toBe(true);
    }
    // The East Gate is in the Temple Mount's own wall; the other nine are the city's.
    expect(NEHEMIAH_3_GATES.filter((id) => FEATURE_BY_ID[id].wall === 'city')).toHaveLength(9);
    expect(FEATURE_BY_ID['east-gate'].wall).toBe('mount-east');
    // And the Ephraim and Guard gates, which chapters 8 and 12 add, and two the Mount's own.
    expect(GATES).toHaveLength(NEHEMIAH_3_GATES.length + 4);
  });

  it('takes them in the order the chapter does: counter-clockwise from the Sheep Gate', () => {
    // Where each stands along the city's circuit; the East Gate by its nearest point on it.
    const arc = (id) => {
      const gate = FEATURE_BY_ID[id];
      return gate.wall === 'city' ? gate.s : nearestWall(gate.x, gate.z, 'city').s;
    };
    const arcs = NEHEMIAH_3_GATES.map(arc);
    expect(arcs).toEqual([...arcs].sort((a, b) => a - b));
    // The Sheep Gate is where the circuit starts and ends (3:1, 3:32).
    expect(FEATURE_BY_ID['sheep-gate'].s).toBe(0);
    // And the towers fall in their places in it: Meah then Hananel between the
    // Sheep Gate and the Fish Gate (3:1), the Furnaces before the Valley Gate (3:11).
    const tower = (id) => FEATURE_BY_ID[id].s;
    expect(tower('tower-of-meah')).toBeGreaterThan(FEATURE_BY_ID['sheep-gate'].s);
    expect(tower('tower-of-hananel')).toBeGreaterThan(tower('tower-of-meah'));
    expect(tower('tower-of-hananel')).toBeLessThan(FEATURE_BY_ID['fish-gate'].s);
    expect(tower('tower-of-furnaces')).toBeLessThan(FEATURE_BY_ID['valley-gate'].s);
    expect(tower('tower-of-furnaces')).toBeGreaterThan(FEATURE_BY_ID['ephraim-gate'].s);
    expect(tower('great-projecting-tower')).toBeGreaterThan(FEATURE_BY_ID['water-gate'].s);
    expect(tower('great-projecting-tower')).toBeLessThan(FEATURE_BY_ID['horse-gate'].s);
    // Every tower named has its own entry.
    for (const feature of TOWERS) expect(TOWER_INFO[feature.id], feature.id).toBeTruthy();
  });

  it('puts the Dung Gate a thousand cubits from the Valley Gate, along the wall (3:13)', () => {
    expect(arcBetween('valley-gate', 'dung-gate') / CUBIT).toBeCloseTo(1000, -0.3);
    expect(Math.abs(arcBetween('valley-gate', 'dung-gate') - 1000 * CUBIT)).toBeLessThan(1);
  });

  it('goes round about a mile and a half, as the map says', () => {
    const miles = circuitLength('city') / MILE;
    expect(miles).toBeGreaterThan(1.4);
    expect(miles).toBeLessThan(1.7);
  });

  it('names who built each gate, and gives the verses, and has the Muster Gate’s other name', () => {
    expect(GATE_INFO['sheep-gate'].builders).toMatch(/Eliashib the high priest/);
    expect(GATE_INFO['fish-gate'].builders).toMatch(/Hassenaah/);
    expect(GATE_INFO['valley-gate'].builders).toMatch(/Zanoah/);
    expect(GATE_INFO['dung-gate'].builders).toMatch(/Malchijah/);
    expect(GATE_INFO['fountain-gate'].builders).toMatch(/Shallun/);
    expect(GATE_INFO['muster-gate'].alias).toMatch(/Hammiphkad/);
    for (const id of NEHEMIAH_3_GATES) expect(GATE_INFO[id].builders, id).toBeTruthy();
  });

  it('leaves the Western Hill outside the wall and the Broad Wall standing out there (3:8)', () => {
    const city = WALLS[0].vertices.map((v) => [v.x, v.z]);
    expect(insidePolygon(-440, 40, city)).toBe(false);
    const wall = [(BROAD_WALL.x0 + BROAD_WALL.x1) / 2, BROAD_WALL.z];
    expect(insidePolygon(wall[0], wall[1], city)).toBe(false);
    expect(BROAD_WALL.thickness).toBe(7);
  });

  it('stands the Temple on the platform, over the rock, facing east, with the altar before it', () => {
    expect(insidePolygon(TEMPLE.x, TEMPLE.z, MOUNT.polygon)).toBe(true);
    // The rock under the Dome of the Rock, fitted from its real position.
    expect(Math.hypot(TEMPLE.x - -123, TEMPLE.z - -453)).toBeLessThan(20);
    expect(TEMPLE.altar.x).toBeGreaterThan(TEMPLE.x + TEMPLE.length);
    // First Temple's proportions at the modest end: 60 by 20 by 30 cubits (1 Kings 6:2).
    expect(TEMPLE.length / CUBIT).toBe(60);
    expect(TEMPLE.width / CUBIT).toBe(40);
    expect(TEMPLE.height / CUBIT).toBe(30);
    expect(TEMPLE.courtGate.z0).toBeLessThan(TEMPLE.z);
    expect(TEMPLE.courtGate.z1).toBeGreaterThan(TEMPLE.z);
  });

  it('keeps every named house inside the city and clear of the wall', () => {
    const city = WALLS[0].vertices.map((v) => [v.x, v.z]);
    for (const house of HOUSES) {
      const wall = nearestWall(house.x, house.z);
      if (insidePolygon(house.x, house.z, city) || house.id.startsWith('priests') || house.id.startsWith('zadok')
        || house.id.startsWith('meshullam') || house.id.startsWith('temple-servants')) {
        // Inside the city, or in the strip between the Mount's east wall and the city's.
        expect(wall.distance, house.id).toBeGreaterThan(Math.max(house.w, house.d) / 2 + WALLS[0].thickness / 2);
      }
    }
    expect(HOUSES.filter((h) => h.owner).length).toBeGreaterThanOrEqual(6);
  });
});

describe('the wall', () => {
  it('is a closed loop with a walkable top: continuous, and nowhere steeper than a stair', () => {
    const first = CITY.samples[0];
    const last = CITY.samples[CITY.count - 1];
    expect(Math.abs(first.top - last.top)).toBeLessThan(0.34 * CITY.step + 0.01);
    for (const profile of PROFILES) {
      const n = profile.count - (profile.closed ? 0 : 1);
      for (let k = 0; k < n; k += 1) {
        const a = profile.samples[k];
        const b = profile.samples[(k + 1) % profile.count];
        expect(Math.abs(b.top - a.top) / profile.step, `${profile.wall.id} ${k}`).toBeLessThan(0.34 + 1e-6);
      }
    }
  });

  it('stands about sixteen cubits above the higher ground and never below the Mount’s', () => {
    for (const sample of CITY.samples) {
      expect(sample.top - sample.high).toBeGreaterThan(WALLS[0].height - 1.3);
      expect(sample.top - sample.gOut, 'the outer face is a wall, not a cliff').toBeLessThan(14);
    }
    for (const profile of PROFILES.slice(1)) {
      for (const sample of profile.samples) expect(sample.top).toBeGreaterThan(MOUNT.level);
    }
  });

  it('is three states, shorter each time you go back: ruin, half, finished (1:3; 4:6; 6:15)', () => {
    for (const sample of CITY.samples.filter((_, k) => k % 7 === 0)) {
      const ruin = topAt(CITY, sample, 'ruin');
      const half = topAt(CITY, sample, 'half');
      const built = topAt(CITY, sample, 'built');
      expect(ruin).toBeLessThan(half);
      expect(half).toBeLessThan(built);
      // Half its height, give or take the stretches that ran ahead or behind —
      // on level ground; on a slope it is never lower than a man above the
      // higher ground, or it would be a wall nobody could see.
      expect((half - sample.low) / (built - sample.low)).toBeGreaterThan(0.44);
      if (sample.high - sample.low < 0.5) expect((half - sample.low) / (built - sample.low)).toBeLessThan(0.58);
      expect(half - sample.high).toBeGreaterThanOrEqual(2 - 1e-9);
    }
    // A ruin has gaps as well as stumps.
    const gaps = Array.from({ length: 300 }, (_, i) => ruinHeight(CITY, i * 7 + 1)).filter((h) => h === 0);
    expect(gaps.length).toBeGreaterThan(40);
    expect(gaps.length).toBeLessThan(180);
    expect(WALL_STATES).toEqual(['ruin', 'half', 'built']);
  });

  it('is in the state the text gives at each staged moment', () => {
    for (const event of NEHEMIAH.events) {
      expect(WALL_STATES, event.id).toContain(EVENT_WALL_STATE[event.id]);
    }
    expect(Object.keys(EVENT_WALL_STATE).sort()).toEqual(NEHEMIAH.events.map((e) => e.id).sort());
    // The night ride and the call to build are among ruins; the builders at half a wall (4:6).
    expect(EVENT_WALL_STATE['night-ride']).toBe('ruin');
    expect(EVENT_WALL_STATE['rise-and-build']).toBe('ruin');
    expect(EVENT_WALL_STATE.mockery).toBe('half');
    expect(EVENT_WALL_STATE['sword-and-trowel']).toBe('half');
    // The doors are hung last (6:1), so the Sheep Gate consecrated with its doors is a finished wall.
    expect(EVENT_WALL_STATE['sheep-gate']).toBe('built');
    expect(EVENT_WALL_STATE.finished).toBe('built');
    expect(EVENT_WALL_STATE.dedication).toBe('built');
  });

  it('keeps every flight of stairs out of every gate’s way, and clear of each other', () => {
    for (const flight of STAIR_FLIGHTS) {
      for (const gate of GATES) {
        if (gate.id === flight.spec.vertex) continue;
        for (const p of flight.points) {
          expect(Math.hypot(p.x - gate.x, p.z - gate.z), `${flight.id} across ${gate.id}`).toBeGreaterThan(8);
        }
      }
      // Not across the gate it is built beside either: the passage and the way up to it stay open.
      const own = FEATURE_BY_ID[flight.spec.vertex];
      for (const p of flight.points) expect(Math.hypot(p.x - own.x, p.z - own.z), `${flight.id} at its own gate`).toBeGreaterThan(6);
    }
    for (let i = 0; i < STAIR_FLIGHTS.length; i += 1) {
      for (let j = i + 1; j < STAIR_FLIGHTS.length; j += 1) {
        for (const a of STAIR_FLIGHTS[i].points) {
          for (const b of STAIR_FLIGHTS[j].points) {
            expect(Math.hypot(a.x - b.x, a.z - b.z), `${STAIR_FLIGHTS[i].id} / ${STAIR_FLIGHTS[j].id}`).toBeGreaterThan(3);
          }
        }
      }
    }
  });

  it('takes the walkers’ stairs up to the walkway, one of them by the stairs of the city of David (3:15; 12:37)', () => {
    expect(STAIRS.find((s) => s.id === 'city-of-david-stairs').vertex).toBe('fountain-gate');
    expect(STAIR_FLIGHTS).toHaveLength(STAIRS.length);
    for (const flight of STAIR_FLIGHTS) {
      const last = flight.points[flight.points.length - 1];
      // Rises at the stair slope, and ends level with the walkway beside it.
      expect(last.h).toBeCloseTo(frameAt(PROFILE_BY_ID[flight.wall], last.s).top, 1);
      expect(flight.points[0].h - groundAt(flight.points[0].x, flight.points[0].z)).toBeLessThan(0.1);
      expect(flight.length).toBeGreaterThan(5);
    }
  });
});

describe('the ground', () => {
  it('levels the Temple Mount to its platform, and keeps the square before the Water Gate open and flat', () => {
    expect(groundAt(-120, -430)).toBeCloseTo(MOUNT.level, 5);
    expect(groundAt(TEMPLE.x + 12, TEMPLE.z)).toBeCloseTo(MOUNT.level, 5);
    const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => groundAt(WATER_SQUARE.x + dx * 12, WATER_SQUARE.z + dz * 12));
    for (const y of around) expect(Math.abs(y - WATER_SQUARE.level)).toBeLessThan(0.3);
    // The square is inside the wall, and the Water Gate opens on it.
    expect(insidePolygon(WATER_SQUARE.x, WATER_SQUARE.z, WALLS[0].vertices.map((v) => [v.x, v.z]))).toBe(true);
    expect(Math.hypot(WATER_SQUARE.x - FEATURE_BY_ID['water-gate'].x, WATER_SQUARE.z - FEATURE_BY_ID['water-gate'].z)).toBeLessThan(40);
  });

  it('leaves the ground alone away from what it reshapes', () => {
    expect(shapeGround(300, 300, 12.5)).toBe(12.5);
    expect(shapeGround(-450, 100, 40)).toBe(40);
  });

  it('keeps the gates’ passages level with the ground that is there', () => {
    for (const gate of GATES) {
      const wall = PROFILE_BY_ID[gate.wall].wall;
      const a = groundAt(gate.x - gate.nx * (wall.thickness / 2 + 1), gate.z - gate.nz * (wall.thickness / 2 + 1));
      const b = groundAt(gate.x + gate.nx * (wall.thickness / 2 + 1), gate.z + gate.nz * (wall.thickness / 2 + 1));
      // Across the five metres of the passage, a slope a visitor can walk: the
      // Temple Mount's own gates open on the lip of the platform.
      expect(Math.abs(a - b) / (wall.thickness + 2), gate.id).toBeLessThan(0.8);
    }
  });

  it('has real streets between the gates, and trees that are not in them', () => {
    expect(STREETS.length).toBeGreaterThanOrEqual(4);
    for (const tree of groves()) expect(streetDistance(tree.x, tree.z).distance).toBeGreaterThan(-2);
    expect(groves().length).toBeGreaterThan(300);
  });
});

describe('walking', () => {
  const walk = (from, dx, dz, steps, step = 0.5) => {
    let current = stanceAt(from.x, from.z, from.h ?? groundAt(from.x, from.z));
    if (!current) return { current: null, moved: 0, blocked: 'start' };
    const start = { x: current.x, z: current.z };
    let blocked = null;
    for (let i = 0; i < steps; i += 1) {
      current = move(current, dx * step, dz * step);
      if (current.blocked) blocked = current.blocked;
    }
    return { current, moved: Math.hypot(current.x - start.x, current.z - start.z), blocked };
  };

  it.each(WALL_STATES)('goes through every gate in the %s wall', (state) => {
    setWallState(state);
    for (const gate of GATES) {
      const result = walk({ x: gate.x - gate.nx * 7, z: gate.z - gate.nz * 7 }, gate.nx, gate.nz, 40);
      expect(result.moved, `${gate.id} in the ${state} wall`).toBeGreaterThan(19);
    }
  });

  it.each(['half', 'built'])('stops at the %s wall between the gates, and says which wall', (state) => {
    setWallState(state);
    let tried = 0;
    for (const profile of PROFILES) {
      for (let s = 20; s < profile.length - 20; s += 37) {
        const frame = frameAt(profile, s);
        // Clear of every gate and tower.
        if (FEATURES.some((f) => f.wall === profile.wall.id && Math.hypot(f.x - frame.x, f.z - frame.z) < 22)) continue;
        const start = { x: frame.x - frame.nx * 5, z: frame.z - frame.nz * 5 };
        if (!stanceAt(start.x, start.z, groundAt(start.x, start.z))) continue;
        const result = walk(start, frame.nx, frame.nz, 40);
        tried += 1;
        expect(result.moved, `${profile.wall.id} at ${Math.round(s)}`).toBeLessThan(11);
        expect(Object.keys(BARRIERS)).toContain(result.blocked);
      }
    }
    expect(tried).toBeGreaterThan(25);
  });

  it('walks through a ruin where it has fallen and is stopped where a stump stands', () => {
    setWallState('ruin');
    const results = { through: 0, stopped: 0 };
    for (let s = 10; s < CITY.length - 10; s += 5) {
      const frame = frameAt(CITY, s);
      if (FEATURES.some((f) => f.wall === 'city' && Math.hypot(f.x - frame.x, f.z - frame.z) < 12)) continue;
      const here = ruinHeight(CITY, s);
      const near = ruinHeight(CITY, s - 4) + ruinHeight(CITY, s + 4);
      // Only where the stretch is wholly gap or wholly stump, so the test cannot be about an edge.
      if (!(here === 0 && near === 0) && !(here > 0.8 && ruinHeight(CITY, s - 3) > 0.8 && ruinHeight(CITY, s + 3) > 0.8)) continue;
      const p = { x: frame.x - frame.nx * 4, z: frame.z - frame.nz * 4 };
      if (!stanceAt(p.x, p.z, groundAt(p.x, p.z))) continue;
      const result = walk(p, frame.nx, frame.nz, 24);
      if (here === 0) {
        if (result.moved > 11) results.through += 1;
      } else if (result.moved < 8 && result.blocked === 'ruined-wall') results.stopped += 1;
    }
    expect(results.through).toBeGreaterThan(3);
    expect(results.stopped).toBeGreaterThan(3);
  });

  it('climbs every stair and walks on along the top; only the finished wall has a walkway', () => {
    for (const flight of STAIR_FLIGHTS) {
      setWallState('built');
      const a = flight.points[0];
      let current = stanceAt(a.x, a.z, groundAt(a.x, a.z));
      expect(current, flight.id).toBeTruthy();
      for (let i = 1; i < flight.points.length; i += 1) {
        const p = flight.points[i];
        for (let k = 0; k < 8; k += 1) current = move(current, (p.x - current.x) / (8 - k), (p.z - current.z) / (8 - k));
        expect(current.height, `${flight.id} at u=${p.u}`).toBeCloseTo(p.h, 0);
      }
      expect(current.region, flight.id).toBe('stair');
      // Step onto the walkway and follow it a hundred metres.
      const profile = PROFILE_BY_ID[flight.wall];
      const here = nearestWall(current.x, current.z);
      current = move(current, here.px - current.x, here.pz - current.z);
      expect(current.region, flight.id).toBe('wall');
      let travelled = 0;
      for (let i = 0; i < 200 && current.region === 'wall'; i += 1) {
        const hit = nearestWall(current.x, current.z);
        const ahead = frameAt(profile, hit.s - flight.spec.direction * 0.5);
        const next = move(current, ahead.x - current.x, ahead.z - current.z);
        travelled += Math.hypot(next.x - current.x, next.z - current.z);
        current = next;
      }
      expect(travelled, `${flight.id} along the top`).toBeGreaterThan(95);
      // The same spot in a half wall is no walkway at all.
      setWallState('half');
      expect(floorAt(here.px, here.pz, current.height - 1)?.region, flight.id).not.toBe('wall');
    }
  });

  it('keeps a visitor on the walkway: its edges are edges, and name nothing but themselves', () => {
    setWallState('built');
    const f = frameAt(CITY, 900);
    const top = wallTopAt(f.x, f.z);
    expect(top).toBeTruthy();
    let current = { x: f.x, z: f.z, height: top.height, region: 'wall', blocked: null };
    for (let i = 0; i < 20; i += 1) current = move(current, f.nx * 0.5, f.nz * 0.5);
    // Walked ten metres toward the edge, and still on the wall.
    expect(current.region).toBe('wall');
    expect(Math.abs(current.height - top.height)).toBeLessThan(1);
    const off = (current.x - f.x) * f.nx + (current.z - f.z) * f.nz;
    expect(off).toBeLessThan(WALLS[0].thickness / 2);
    // And the other edge.
    current = { x: f.x, z: f.z, height: top.height, region: 'wall', blocked: null };
    for (let i = 0; i < 20; i += 1) current = move(current, -f.nx * 0.5, -f.nz * 0.5);
    expect(current.region).toBe('wall');
  });

  it('shuts the gates in as a short stone tunnel, and the open air out of it', () => {
    setWallState('built');
    const gate = FEATURE_BY_ID['valley-gate'];
    expect(enclosureAt(gate.x, gate.z)).toBeGreaterThan(0.4);
    expect(enclosureAt(gate.x - gate.nx * 12, gate.z - gate.nz * 12)).toBe(0);
    // No lintel in half a wall or a ruin: open sky over the way through.
    for (const state of ['half', 'ruin']) {
      setWallState(state);
      expect(enclosureAt(gate.x, gate.z), state).toBeLessThan(0.3);
    }
  });

  it('is stopped by every solid thing with a reason, never by one the panels cannot explain', () => {
    const ids = new Set();
    for (let x = WALK.x0 + 3; x < WALK.x1; x += 6.3) {
      for (let z = WALK.z0 + 3; z < WALK.z1; z += 6.1) {
        const floor = floorAt(x, z, groundAt(x, z));
        if (!floor) continue;
        const hit = blockerAt(x, z, floor.height);
        if (hit) ids.add(hit);
      }
    }
    for (const id of ids) {
      expect(Object.keys(BARRIERS).concat(['olive']), `${id} stops a walker`).toContain(id);
    }
    // And the scene’s own prose is complete.
    for (const barrier of Object.values(BARRIERS)) {
      expect(barrier.label, barrier.id).toBeTruthy();
      expect(barrier.body.length, barrier.id).toBeGreaterThan(120);
      expect(barrier.refs.length, barrier.id).toBeGreaterThan(0);
    }
    for (const id of ['western-hill', 'the-kidron', 'north-edge', 'hinnom']) expect(BARRIERS[id], id).toBeTruthy();
  });

  it('is stopped at the Temple’s door, its altar and the pools', () => {
    const house = walk({ x: TEMPLE.x + TEMPLE.length + TEMPLE.porch + 14, z: TEMPLE.z, h: MOUNT.level }, -1, 0, 50);
    expect(house.blocked).toMatch(/sanctuary|temple-court/);
    for (const pool of POOLS) {
      const result = walk({ x: pool.x + pool.w, z: pool.z + 6 }, -1, -0.2, 40);
      if (result.current) expect(['pool', 'house', 'city-wall', 'royal-ruin']).toContain(result.blocked || 'pool');
    }
    expect(blockerAt(POOLS[0].x, POOLS[0].z, groundAt(POOLS[0].x, POOLS[0].z))).toBe('pool');
  });

  it('keeps the edges of the world with prose, and the rubble where the animal could not pass', () => {
    expect(blockerAt(WALK.x0 - 1, 0)).toBe('western-hill');
    expect(blockerAt(WALK.x1 + 1, 0)).toBe('the-kidron');
    expect(blockerAt(0, WALK.z0 - 1)).toBe('north-edge');
    expect(blockerAt(0, WALK.z1 + 1)).toBe('hinnom');
    expect(blockerAt(-34, 372, groundAt(-34, 372))).toBe('rubble');
    // But the way out of the Fountain Gate is not buried.
    const gate = FEATURE_BY_ID['fountain-gate'];
    expect(blockerAt(gate.x + gate.nx * 6, gate.z + gate.nz * 6, groundAt(gate.x + gate.nx * 6, gate.z + gate.nz * 6))).toBeNull();
  });

  it('knows what each place sounds like underfoot', () => {
    for (const region of ['wall', 'gate', 'stair', 'mount']) expect(surfaceForRegion(region)).toBe('stone');
    for (const region of ['city', 'hill', 'slope', 'kidron']) expect(surfaceForRegion(region)).toBe('earth');
    setWallState('built');
    expect(regionAt(FEATURE_BY_ID['water-gate'].x, FEATURE_BY_ID['water-gate'].z)).toBe('gate');
    expect(regionAt(TEMPLE.x, TEMPLE.z)).toBe('mount');
    expect(BODY_RADIUS).toBeGreaterThan(0);
  });
});

describe('the manifest against the collision model', () => {
  const stateFor = (event) => EVENT_WALL_STATE[event] || 'built';

  it('opens on a vantage that exists, with every Y a standing eye above a real floor', () => {
    expect(NEHEMIAH.vantages.map((v) => v.id)).toContain(NEHEMIAH.defaultVantage);
    for (const vantage of NEHEMIAH.vantages) {
      setWallState(vantage.event ? stateFor(vantage.event) : 'built');
      const [x, eye, z] = vantage.position;
      const stance = stanceAt(x, z, eye - 1.7);
      expect(stance, vantage.id).toBeTruthy();
      expect(eye, vantage.id).toBeCloseTo(stance.height + 1.7, 0);
    }
  });

  it('stands the visitor for each moment on a floor of the state that moment sets', () => {
    for (const event of NEHEMIAH.events) {
      setWallState(stateFor(event.id));
      const [x, eye, z] = event.position;
      const stance = stanceAt(x, z, eye - 1.7);
      expect(stance, event.id).toBeTruthy();
      expect(eye, event.id).toBeCloseTo(stance.height + 1.7, 0);
      expect(Math.hypot(x - EVENT_GROUND[event.id].x, z - EVENT_GROUND[event.id].z), event.id).toBeLessThan(EVENT_GROUND[event.id].r + 20);
    }
  });

  it('hangs every pin above ground or wall that is there, in reach of its gate or place', () => {
    for (const pin of NEHEMIAH.hotspots) {
      const [x, y, z] = pin.position;
      const floor = Math.max(groundAt(x, z), wallTopAt(x, z)?.height ?? -Infinity);
      expect(y, pin.id).toBeGreaterThan(floor - 0.01);
      expect(y - floor, pin.id).toBeLessThan(24);
      expect(pin.maxDistance, pin.id).toBeGreaterThan(20);
    }
    // Each gate of the chapter has its own pin, at its own gate.
    for (const id of NEHEMIAH_3_GATES) {
      const pin = NEHEMIAH.hotspots.find((p) => p.id === id);
      expect(pin, id).toBeTruthy();
      const gate = FEATURE_BY_ID[id];
      expect(Math.hypot(pin.position[0] - gate.x, pin.position[2] - gate.z), id).toBeLessThan(1);
    }
  });

  it('keeps the gate width, and a gate wide enough for the visitor', () => {
    expect(GATE.width / 2 - BODY_RADIUS).toBeGreaterThan(1.5);
    expect(gateAt(FEATURE_BY_ID['sheep-gate'].x, FEATURE_BY_ID['sheep-gate'].z)).toBeTruthy();
    expect(stairAt(-9999, -9999)).toBeNull();
  });
});
