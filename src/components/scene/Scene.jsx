import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, Compass, BookOpen, Info, Loader2, MapPin } from 'lucide-react';
import { resolveScene, defaultVantage, SCENE_DISCLAIMER } from '../../lib/scenes';
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

  // Resolved before the first paint rather than in the effect: whether this
  // device can render at all is a property of the browser, not something the
  // effect discovers, and setting it from inside one costs a cascading render.
  const [status, setStatus] = useState(() => (webglAvailable() ? 'loading' : 'unsupported'));
  // loading | ready | unsupported | error
  const [entered, setEntered] = useState(false);
  const [vantageId, setVantageId] = useState(() => defaultVantage(scene)?.id || null);
  const [panel, setPanel] = useState(null); // { kind: 'vantage' | 'hotspot', data }

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
          if (t >= 1) engine.transition = null;
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

    const sensitivity = () => 0.0026 * ((engineRef.current?.fov || 60) / 60);

    const onPointerDown = (event) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      stage.setPointerCapture?.(event.pointerId);
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
    };

    const onWheel = (event) => {
      const engine = engineRef.current;
      if (!engine) return;
      event.preventDefault();
      engine.fov = Math.min(FOV_MAX, Math.max(FOV_MIN, engine.fov + event.deltaY * 0.045));
    };

    const onKeyDown = (event) => {
      const engine = engineRef.current;
      if (!engine) return;
      const step = 0.06;
      if (event.key === 'ArrowLeft') engine.yaw += step;
      else if (event.key === 'ArrowRight') engine.yaw -= step;
      else if (event.key === 'ArrowUp') engine.pitch = Math.min(PITCH_MAX, engine.pitch + step);
      else if (event.key === 'ArrowDown') engine.pitch = Math.max(PITCH_MIN, engine.pitch - step);
      else return;
      engine.transition = null;
      event.preventDefault();
    };

    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('keydown', onKeyDown);
    return () => {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointercancel', onPointerUp);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('keydown', onKeyDown);
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
          {scene.hotspots.map((hotspot) => (
            <section key={hotspot.id} className="scene-fallback-section">
              <h2>{hotspot.label}</h2>
              <p>{hotspot.body}</p>
              <div className="scene-refs">
                {hotspot.refs.map((ref) => (
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
        aria-label={`${scene.title}. Drag or use the arrow keys to look around.`}
      >
        <canvas ref={canvasRef} className="scene-canvas" />

        {status === 'ready' && entered && scene.hotspots.map((hotspot) => (
          <button
            key={hotspot.id}
            type="button"
            ref={(el) => registerHotspot(hotspot.id, el)}
            className={`scene-hotspot${panel?.data?.id === hotspot.id ? ' active' : ''}`}
            style={{ display: 'none' }}
            onClick={() => setPanel({ kind: 'hotspot', data: hotspot })}
          >
            <span className="scene-hotspot-dot" />
            <span className="scene-hotspot-label">{hotspot.label}</span>
          </button>
        ))}
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
          <p className="scene-hint" aria-hidden="true">Drag to look around · scroll to zoom</p>

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
                {panel.kind === 'vantage' ? <><Compass size={12} /> You are standing at</> : <><Info size={12} /> Look closer</>}
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
