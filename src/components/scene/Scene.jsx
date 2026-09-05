import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, Compass, BookOpen, Info, Loader2, MapPin, Hand } from 'lucide-react';
import { resolveScene, defaultVantage, SCENE_DISCLAIMER } from '../../lib/scenes';
import {
  stanceAt,
  move as stepMove,
  groundPointAlongRay,
  BARRIERS,
} from './templeNavigation';
import { EYE_HEIGHT } from './templeDimensions';
import './Scene.css';

// Immersive first-person route for a reconstructed biblical site. Layout hides
// its chrome (see the immersive check in Layout.jsx) so the scene fills the
// device and provides its own Exit control, the same contract /reels and
// /atlas use.
//
// three.js and the geometry builder are both loaded dynamically inside the
// effect rather than imported at module scope: the intro card can then paint
// immediately while the 3D chunk is still in flight, and jsdom — which has no
// WebGL and would never get past the support check anyway — never pays to
// parse them.

// Opens the passage in the global BibleLookup reader. BibleLookup is mounted
// outside <Layout> in App.jsx, so it renders over this immersive route with no
// plumbing of its own — same event the atlas sheet and the wiki dispatch.
const openScripture = (ref) =>
  window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref } }));

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext
      && (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    );
  } catch {
    return false;
  }
}

function hasCoarsePointer() {
  return Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Phones and low-core machines get the cheap build: no shadow maps, fewer
// columns, a smaller crowd. See buildSecondTemple's `low` branch.
function detectQuality() {
  const smallScreen = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  const fewCores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency > 0
    && navigator.hardwareConcurrency <= 4;
  return smallScreen || fewCores ? 'low' : 'high';
}

// Camera direction convention shared with src/lib/scenes.js: yaw 0 looks down
// -Z (west, at the sanctuary), which is also three.js's default, so a vantage
// staring straight at the temple needs no correction.
function aimFrom(position, lookAt) {
  const dx = lookAt[0] - position[0];
  const dy = lookAt[1] - position[1];
  const dz = lookAt[2] - position[2];
  const flat = Math.hypot(dx, dz) || 1e-6;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, flat) };
}

// Shortest way round the circle, so a turn from +170° to -170° swings 20°
// rather than 340°.
function shortestAngle(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

const PITCH_MIN = -1.05;
const PITCH_MAX = 1.15;
const FOV_MIN = 32;
const FOV_MAX = 78;

// Metres per second. A brisk walk, and a jog for anyone crossing the 345m
// platform who would rather not do it in real time.
const WALK_SPEED = 3.6;
const RUN_SPEED = 8.5;
const ARRIVED = 0.6;

// A tap is a touch that goes nowhere and does not linger; anything else is a
// drag, and drags look around.
const TAP_SLOP_PX = 9;
const TAP_MS = 400;

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown']);

// How far ahead to walk when a tap lands on something that cannot be a
// destination — the sky, a wall, or the floor of a court above your eye. The
// visitor still moves the way they pointed, climbing whatever is in the way.
const BEARING_DISTANCES = [26, 17, 11, 6];

// Remounting on the slug is what keeps a second scene honest: `status`,
// `entered` and the whole renderer are per-scene, and carrying any of them
// across a navigation would show the next site's intro card already dismissed
// over a temple that hasn't been built yet.
export default function Scene() {
  const { slug } = useParams();
  return <SceneView key={slug} slug={slug} />;
}

function SceneView({ slug }) {
  const navigate = useNavigate();
  const scene = useMemo(() => resolveScene(slug), [slug]);

  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  // Imperative handles the render loop owns. Nothing here belongs in state:
  // it changes every frame, and re-rendering React 60 times a second to move a
  // label would cost more than the scene itself.
  const engineRef = useRef(null);
  const hotspotElsRef = useRef(new Map());
  const walkMarkerRef = useRef(null);
  const stickRef = useRef(null);
  const knobRef = useRef(null);

  // Resolved before the first paint rather than in the effect: whether this
  // device can render at all is a property of the browser, not something the
  // effect discovers, and setting it from inside one costs a cascading render.
  const [status, setStatus] = useState(() => (webglAvailable() ? 'loading' : 'unsupported'));
  // loading | ready | unsupported | error
  const [entered, setEntered] = useState(false);
  const [vantageId, setVantageId] = useState(() => defaultVantage(scene)?.id || null);
  const [panel, setPanel] = useState(null); // { kind: 'vantage' | 'hotspot' | 'barrier', data }
  const [coarse] = useState(hasCoarsePointer);

  const registerHotspot = useCallback((id, element) => {
    if (element) hotspotElsRef.current.set(id, element);
    else hotspotElsRef.current.delete(id);
  }, []);

  // --- boot the renderer --------------------------------------------------

  useEffect(() => {
    if (!scene || status === 'unsupported') return undefined;

    let disposed = false;
    let cleanup = () => {};

    (async () => {
      let THREE;
      let buildSecondTemple;
      try {
        [THREE, { default: buildSecondTemple }] = await Promise.all([
          import('three'),
          import('./buildSecondTemple'),
        ]);
      } catch {
        if (!disposed) setStatus('error');
        return;
      }
      if (disposed) return;

      const canvas = canvasRef.current;
      const stage = stageRef.current;
      if (!canvas || !stage) return;

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      } catch {
        setStatus('unsupported');
        return;
      }

      const quality = detectQuality();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.5 : 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      if (quality !== 'low') {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }

      const world = new THREE.Scene();
      // Warm haze. The sky is a custom ShaderMaterial with no fog chunk, so it
      // stays clear while everything on the ground softens with distance —
      // which is what sells the size of the platform.
      world.fog = new THREE.FogExp2(0xd8c8a6, 0.0013);

      const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2400);
      camera.rotation.order = 'YXZ';

      const built = buildSecondTemple(THREE, {
        quality,
        maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      });
      world.add(built.root);

      const start = defaultVantage(scene);
      const aim = aimFrom(start.position, start.lookAt);
      camera.position.set(...start.position);
      camera.rotation.set(aim.pitch, aim.yaw, 0);

      const engine = {
        THREE,
        renderer,
        world,
        camera,
        built,
        yaw: aim.yaw,
        pitch: aim.pitch,
        fov: 60,
        transition: null,
        reduced: prefersReducedMotion(),
        projected: new THREE.Vector3(),
        anchor: new THREE.Vector3(),
        hotspotState: new Map(),
        // Where the visitor is standing. The camera is derived from this every
        // frame rather than being moved directly, so collision has exactly one
        // place to say no.
        walker: stanceAt(start.position[0], start.position[2]),
        eyeY: start.position[1],
        keys: new Set(),
        running: false,
        stick: { x: 0, y: 0 },
        walkTarget: null,
        vantageActive: true,
        lastBarrier: { id: null, at: 0 },
      };
      engineRef.current = engine;

      const resize = () => {
        const { clientWidth, clientHeight } = stage;
        if (!clientWidth || !clientHeight) return;
        renderer.setSize(clientWidth, clientHeight, false);
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(stage);

      // --- render loop ------------------------------------------------------
      let frame = 0;
      let last = performance.now();
      const clockStart = last;

      const tick = (now) => {
        frame = requestAnimationFrame(tick);
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        if (document.hidden) return;

        const move = engine.transition;
        if (move) {
          move.elapsed += dt;
          const t = engine.reduced ? 1 : Math.min(move.elapsed / move.duration, 1);
          const e = easeInOut(t);
          camera.position.set(
            move.from.position[0] + (move.to.position[0] - move.from.position[0]) * e,
            move.from.position[1] + (move.to.position[1] - move.from.position[1]) * e,
            move.from.position[2] + (move.to.position[2] - move.from.position[2]) * e,
          );
          engine.yaw = move.from.yaw + move.yawDelta * e;
          engine.pitch = move.from.pitch + (move.to.pitch - move.from.pitch) * e;
          if (t >= 1) {
            engine.transition = null;
            // Hand the walker the ground under wherever the flight landed, so
            // the first step after a fast travel starts from the right floor.
            const landed = stanceAt(move.to.position[0], move.to.position[2]);
            if (landed) engine.walker = landed;
            engine.eyeY = camera.position.y;
          }
        } else if (engine.walker) {
          // --- walking ------------------------------------------------------
          const forwardX = -Math.sin(engine.yaw);
          const forwardZ = -Math.cos(engine.yaw);
          const rightX = Math.cos(engine.yaw);
          const rightZ = -Math.sin(engine.yaw);

          let ahead = 0;
          let across = 0;
          if (engine.keys.has('w') || engine.keys.has('arrowup')) ahead += 1;
          if (engine.keys.has('s') || engine.keys.has('arrowdown')) ahead -= 1;
          if (engine.keys.has('a')) across -= 1;
          if (engine.keys.has('d')) across += 1;
          ahead += engine.stick.y;
          across += engine.stick.x;

          let vx = forwardX * ahead + rightX * across;
          let vz = forwardZ * ahead + rightZ * across;
          let magnitude = Math.hypot(vx, vz);

          // Taking the controls cancels an auto-walk rather than fighting it.
          if (magnitude > 0.02) engine.walkTarget = null;
          else if (engine.walkTarget) {
            const toX = engine.walkTarget.x - engine.walker.x;
            const toZ = engine.walkTarget.z - engine.walker.z;
            const remaining = Math.hypot(toX, toZ);
            if (remaining < ARRIVED) {
              engine.walkTarget = null;
            } else {
              vx = toX / remaining;
              vz = toZ / remaining;
              magnitude = 1;
            }
          }

          if (magnitude > 0.02) {
            const speed = (engine.running ? RUN_SPEED : WALK_SPEED) * Math.min(1, magnitude);
            const scale = (speed * dt) / magnitude;
            const before = engine.walker;
            const stepped = stepMove(before, vx * scale, vz * scale);
            const moved = stepped.x !== before.x || stepped.z !== before.z;
            engine.walker = stepped;

            if (moved && engine.vantageActive) {
              engine.vantageActive = false;
              setVantageId(null);
            }
            // Grinding against a wall on the way to a tapped destination means
            // the destination is not reachable from here; give up on it rather
            // than shuffling in place.
            if (!moved) engine.walkTarget = null;

            const barrier = BARRIERS[stepped.blocked];
            if (barrier && (engine.lastBarrier.id !== barrier.id || now - engine.lastBarrier.at > 12000)) {
              engine.lastBarrier = { id: barrier.id, at: now };
              setPanel({ kind: 'barrier', data: barrier });
            }
          }

          // Smoothed so the stairs are a ramp underfoot rather than a series of
          // jolts, and so a floor change on arrival eases in.
          const targetEye = engine.walker.height + EYE_HEIGHT;
          engine.eyeY += (targetEye - engine.eyeY) * Math.min(1, dt * 9);
          camera.position.set(engine.walker.x, engine.eyeY, engine.walker.z);
        }

        camera.rotation.set(engine.pitch, engine.yaw, 0);
        if (camera.fov !== engine.fov) {
          camera.fov = engine.fov;
          camera.updateProjectionMatrix();
        }

        built.update((now - clockStart) / 1000);
        renderer.render(world, camera);

        // Project the anchored labels to screen space and move them with plain
        // DOM writes — they are real <button>s so they stay tabbable and
        // readable, but they must not go through React state.
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        for (const hotspot of scene.hotspots) {
          const el = hotspotElsRef.current.get(hotspot.id);
          if (!el) continue;
          engine.anchor.set(...hotspot.position);
          const distance = camera.position.distanceTo(engine.anchor);
          engine.projected.copy(engine.anchor).project(camera);
          const behind = engine.projected.z > 1;
          const x = (engine.projected.x * 0.5 + 0.5) * width;
          const y = (-engine.projected.y * 0.5 + 0.5) * height;
          const onScreen = x > -80 && x < width + 80 && y > -40 && y < height + 40;
          const visible = !behind && onScreen && distance < hotspot.maxDistance;
          const was = engine.hotspotState.get(hotspot.id);
          if (was !== visible) {
            el.style.display = visible ? '' : 'none';
            engine.hotspotState.set(hotspot.id, visible);
          }
          if (visible) el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        }

        const marker = walkMarkerRef.current;
        if (marker) {
          const target = engine.walkTarget;
          if (target) {
            engine.anchor.set(target.x, target.height + 0.06, target.z);
            engine.projected.copy(engine.anchor).project(camera);
            const ahead = engine.projected.z <= 1;
            marker.style.display = ahead ? '' : 'none';
            if (ahead) {
              const mx = (engine.projected.x * 0.5 + 0.5) * width;
              const my = (-engine.projected.y * 0.5 + 0.5) * height;
              marker.style.transform = `translate(-50%, -50%) translate(${mx}px, ${my}px)`;
            }
          } else if (marker.style.display !== 'none') {
            marker.style.display = 'none';
          }
        }
      };
      frame = requestAnimationFrame(tick);

      setStatus('ready');

      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        built.dispose();
        world.clear();
        renderer.dispose();
        engineRef.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  // `status` is read only as an entry guard here; it is deliberately out of the
  // dependency list so that the transition to 'ready' at the end of this effect
  // does not tear the renderer down and rebuild it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // --- look controls ------------------------------------------------------

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || status !== 'ready') return undefined;

    const pointers = new Map();
    let pinchDistance = 0;
    let tap = null;

    const sensitivity = () => 0.0026 * ((engineRef.current?.fov || 60) / 60);

    // Turns a tap into somewhere to walk. Where the ray finds real ground that
    // is the destination; where it does not — the sky, a wall, or the floor of
    // a court standing above the eye aiming at it — the visitor walks on the
    // bearing they tapped instead, which is what carries them up a stair.
    const walkToTap = (clientX, clientY) => {
      const engine = engineRef.current;
      if (!engine || !engine.walker) return;
      const rect = stage.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
      const direction = new engine.THREE.Vector3(ndcX, ndcY, 0.5)
        .unproject(engine.camera)
        .sub(engine.camera.position)
        .normalize();

      engine.transition = null;
      const hit = groundPointAlongRay(engine.camera.position, direction);
      if (hit) {
        engine.walkTarget = hit;
        return;
      }

      const bearing = Math.hypot(direction.x, direction.z);
      if (bearing < 1e-3) return;
      for (const distance of BEARING_DISTANCES) {
        const candidate = stanceAt(
          engine.walker.x + (direction.x / bearing) * distance,
          engine.walker.z + (direction.z / bearing) * distance,
        );
        if (candidate) {
          engine.walkTarget = candidate;
          return;
        }
      }
    };

    const onPointerDown = (event) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      stage.setPointerCapture?.(event.pointerId);
      tap = pointers.size === 1 ? { x: event.clientX, y: event.clientY, at: performance.now() } : null;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };

    const onPointerMove = (event) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const engine = engineRef.current;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP_PX) tap = null;
      if (!engine) return;

      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const spread = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDistance) {
          engine.fov = Math.min(FOV_MAX, Math.max(FOV_MIN, engine.fov * (pinchDistance / (spread || 1))));
        }
        pinchDistance = spread;
        return;
      }

      // A deliberate drag also cancels an in-flight vantage move, so grabbing
      // the view mid-flight hands control back instead of fighting the tween.
      engine.transition = null;
      engine.yaw -= (event.clientX - previous.x) * sensitivity();
      engine.pitch = Math.min(
        PITCH_MAX,
        Math.max(PITCH_MIN, engine.pitch - (event.clientY - previous.y) * sensitivity()),
      );
    };

    const onPointerUp = (event) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchDistance = 0;
      stage.releasePointerCapture?.(event.pointerId);
      // Only a tap that landed on the world itself walks; the hotspot buttons
      // sit over the same element and handle their own taps.
      if (tap && performance.now() - tap.at < TAP_MS && event.target === canvasRef.current) {
        walkToTap(event.clientX, event.clientY);
      }
      tap = null;
    };

    const onWheel = (event) => {
      const engine = engineRef.current;
      if (!engine) return;
      event.preventDefault();
      engine.fov = Math.min(FOV_MAX, Math.max(FOV_MIN, engine.fov + event.deltaY * 0.045));
    };

    // Left and right turn, up and down walk — the arrangement anyone who has
    // played a first-person game already has in their fingers. PageUp and
    // PageDown tilt, so looking up at the facade stays reachable without a
    // mouse now that the up arrow is doing something else.
    const onKeyDown = (event) => {
      const engine = engineRef.current;
      if (!engine) return;
      const key = event.key.toLowerCase();
      const turn = 0.06;
      if (key === 'shift') { engine.running = true; return; }
      if (key === 'arrowleft') engine.yaw += turn;
      else if (key === 'arrowright') engine.yaw -= turn;
      else if (key === 'pageup') engine.pitch = Math.min(PITCH_MAX, engine.pitch + turn);
      else if (key === 'pagedown') engine.pitch = Math.max(PITCH_MIN, engine.pitch - turn);
      else if (MOVE_KEYS.has(key)) engine.keys.add(key);
      else return;
      engine.transition = null;
      event.preventDefault();
    };

    const onKeyUp = (event) => {
      const engine = engineRef.current;
      if (!engine) return;
      const key = event.key.toLowerCase();
      engine.keys.delete(key);
      if (key === 'shift') engine.running = false;
    };

    // A key held when the tab loses focus never sends its keyup, which would
    // otherwise leave the visitor walking into a wall until they came back.
    const onBlur = () => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.keys.clear();
      engine.running = false;
    };

    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('keydown', onKeyDown);
    stage.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointercancel', onPointerUp);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('keydown', onKeyDown);
      stage.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [status]);

  // --- vantage movement ---------------------------------------------------

  const goToVantage = useCallback((vantage) => {
    setVantageId(vantage.id);
    setPanel({ kind: 'vantage', data: vantage });
    const engine = engineRef.current;
    if (!engine) return;
    const from = {
      position: engine.camera.position.toArray(),
      yaw: engine.yaw,
      pitch: engine.pitch,
    };
    const to = { position: vantage.position, ...aimFrom(vantage.position, vantage.lookAt) };
    engine.transition = {
      from,
      to,
      yawDelta: shortestAngle(from.yaw, to.yaw),
      elapsed: 0,
      duration: 1.6,
    };
    engine.fov = 60;
    engine.walkTarget = null;
    engine.vantageActive = true;
  }, []);

  // --- thumbstick ---------------------------------------------------------
  // Touch needs direct control as well as tap-to-walk: tapping is the right
  // way to cross a courtyard, but it is a poor way to edge up to a barrier or
  // turn on the spot. The stick writes straight into the engine and moves its
  // own knob, so dragging it never re-renders React.

  const updateStick = useCallback((event) => {
    const pad = stickRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = event.clientX - (rect.left + radius);
    let dy = event.clientY - (rect.top + radius);
    const distance = Math.hypot(dx, dy);
    if (distance > 0) {
      const clamped = Math.min(distance, radius) / radius;
      dx = (dx / distance) * clamped;
      dy = (dy / distance) * clamped;
    }
    const engine = engineRef.current;
    if (engine) {
      engine.stick.x = dx;
      engine.stick.y = -dy; // pushing away from you walks forward
      engine.transition = null;
    }
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx * radius * 0.62}px, ${dy * radius * 0.62}px)`;
    }
  }, []);

  const releaseStick = useCallback((event) => {
    const engine = engineRef.current;
    if (engine) {
      engine.stick.x = 0;
      engine.stick.y = 0;
    }
    if (knobRef.current) knobRef.current.style.transform = '';
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  if (!scene) {
    return (
      <div className="scene-page scene-page--message">
        <MapPin size={26} />
        <p>No scene has been built for this place yet.</p>
        <button type="button" className="scene-ghost-btn" onClick={() => navigate('/atlas')}>
          Back to the atlas
        </button>
      </div>
    );
  }

  const currentVantage = scene.vantages.find((v) => v.id === vantageId) || scene.vantages[0];

  // Without WebGL there is no scene to enter, but there is still a site to read
  // about — so the fallback is the same content the hotspots carry, as text.
  if (status === 'unsupported' || status === 'error') {
    return (
      <div className="scene-page scene-page--fallback">
        <button type="button" className="scene-exit" onClick={() => navigate('/atlas')}>
          <X size={16} /> Exit
        </button>
        <div className="scene-fallback-body">
          <p className="scene-eyebrow">{scene.subtitle}</p>
          <h1>{scene.title}</h1>
          <p className="scene-blurb">{scene.blurb}</p>
          <p className="scene-note">
            {status === 'error'
              ? 'The 3D scene could not be loaded, so here is the walk-through in words.'
              : 'This device can’t render the 3D scene, so here is the walk-through in words.'}
          </p>
          {[...scene.hotspots, ...Object.values(BARRIERS)].map((section) => (
            <section key={section.id} className="scene-fallback-section">
              <h2>{section.label}</h2>
              <p>{section.body}</p>
              <div className="scene-refs">
                {section.refs.map((ref) => (
                  <button key={ref} type="button" className="scene-ref" onClick={() => openScripture(ref)}>
                    <BookOpen size={13} /> {ref}
                  </button>
                ))}
              </div>
            </section>
          ))}
          <p className="scene-disclaimer scene-disclaimer--static">{SCENE_DISCLAIMER}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="scene-page">
      <div
        className="scene-stage"
        ref={stageRef}
        tabIndex={0}
        role="application"
        aria-label={
          `${scene.title}. Drag to look around, or turn with the left and right arrow keys. `
          + 'Walk with W, A, S and D or the up and down arrows, and tilt with Page Up and Page Down.'
        }
      >
        <canvas ref={canvasRef} className="scene-canvas" />

        {status === 'ready' && entered && scene.hotspots.map((hotspot) => (
          <button
            key={hotspot.id}
            type="button"
            ref={(el) => registerHotspot(hotspot.id, el)}
            className={`scene-hotspot${panel?.kind === 'hotspot' && panel.data.id === hotspot.id ? ' active' : ''}`}
            style={{ display: 'none' }}
            onClick={() => setPanel({ kind: 'hotspot', data: hotspot })}
          >
            <span className="scene-hotspot-dot" />
            <span className="scene-hotspot-label">{hotspot.label}</span>
          </button>
        ))}

        {/* Where a tap sent the visitor. Positioned by the render loop. */}
        <span
          className="scene-walk-marker"
          ref={walkMarkerRef}
          style={{ display: 'none' }}
          aria-hidden="true"
        />
      </div>

      {!entered && (
        <div className="scene-intro">
          <div className="scene-intro-card">
            <p className="scene-eyebrow">{scene.subtitle}</p>
            <h1>{scene.title}</h1>
            <p className="scene-blurb">{scene.blurb}</p>
            <button
              type="button"
              className="scene-enter"
              disabled={status !== 'ready'}
              onClick={() => {
                setEntered(true);
                setPanel({ kind: 'vantage', data: currentVantage });
              }}
            >
              {status === 'ready' ? (
                <>
                  <Compass size={16} /> Step inside
                </>
              ) : (
                <>
                  <Loader2 size={16} className="scene-spin" /> Building the temple…
                </>
              )}
            </button>
            <p className="scene-disclaimer">{SCENE_DISCLAIMER}</p>
          </div>
        </div>
      )}

      <button type="button" className="scene-exit" onClick={() => navigate('/atlas')}>
        <X size={16} /> Exit
      </button>

      {entered && (
        <>
          <p className="scene-hint" aria-hidden="true">
            {coarse
              ? 'Drag to look · tap the ground to walk there'
              : 'Drag to look · WASD to walk · click the ground to go there'}
          </p>

          {/* Shown only where the pointer is coarse — see Scene.css. It is a
              sibling of the stage rather than a child so its drags are never
              also read as look-around. */}
          <div
            className="scene-stick"
            ref={stickRef}
            role="application"
            aria-label="Walk"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              updateStick(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture?.(event.pointerId)) updateStick(event);
            }}
            onPointerUp={releaseStick}
            onPointerCancel={releaseStick}
          >
            <span className="scene-stick-knob" ref={knobRef}>
              <Hand size={15} />
            </span>
          </div>

          <div className="scene-vantages" role="group" aria-label="Where to stand">
            {scene.vantages.map((vantage) => (
              <button
                key={vantage.id}
                type="button"
                className={`scene-vantage${vantage.id === vantageId ? ' active' : ''}`}
                aria-pressed={vantage.id === vantageId}
                onClick={() => goToVantage(vantage)}
              >
                {vantage.label}
              </button>
            ))}
          </div>

          {panel && (
            <aside className="scene-panel">
              <button
                type="button"
                className="scene-panel-close"
                aria-label="Close"
                onClick={() => setPanel(null)}
              >
                <X size={15} />
              </button>
              <p className="scene-eyebrow">
                {panel.kind === 'vantage' && <><Compass size={12} /> You are standing at</>}
                {panel.kind === 'hotspot' && <><Info size={12} /> Look closer</>}
                {panel.kind === 'barrier' && <><Hand size={12} /> You can go no further</>}
              </p>
              <h2>{panel.data.label}</h2>
              <p>{panel.kind === 'vantage' ? panel.data.blurb : panel.data.body}</p>
              <div className="scene-refs">
                {panel.data.refs.map((ref) => (
                  <button key={ref} type="button" className="scene-ref" onClick={() => openScripture(ref)}>
                    <BookOpen size={13} /> {ref}
                  </button>
                ))}
              </div>
            </aside>
          )}
        </>
      )}
    </div>
  );
}
