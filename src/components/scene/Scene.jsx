import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  X, Compass, BookOpen, Info, Loader2, MapPin, Hand, Satellite, Volume2, VolumeX,
  Footprints, Square, Sliders, Eye, EyeOff, HelpCircle, List, ChevronDown, ChevronUp,
  Speech, PersonStanding, ScanEye, ScrollText, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  resolveScene, defaultVantage, hotspotsFor, resolveSceneLink, SCENE_DISCLAIMER,
} from '../../lib/scenes';
import { narrationFor } from '../../lib/sceneNarrationManifest';
import { sceneViewUrl } from '../../lib/googleMaps';
import { createSoundscape, surfaceForRegion, audioAvailable, DEFAULT_SCENE_VOLUME } from '../../lib/sceneAudio';
import { sceneModule } from './sceneModules';
import { createPostProcessing, loadPostProcessing } from './scenePostProcessing';
import { TIMES_OF_DAY, DEFAULT_TIME_OF_DAY } from './sceneLighting';
import { useSceneTour } from './useSceneTour';
import { EYE_HEIGHT } from './templeDimensions';
import {
  resolveQualityProfile, getStoredQuality, setStoredQuality, createResolutionManager,
} from './sceneQuality';
import { createAssetSession } from './sceneAssets';
import { clampFov, defaultFovForElement } from './sceneFraming';
import { createHotspotOcclusionManager } from './sceneHotspots';
import {
  PIVOT_HEIGHT, FOLLOW_DISTANCE, JOG_SPEED, THIRD_PERSON_NEAR, ESTABLISHING,
  aimFrom, thirdPersonAim, clampThirdPersonPitch, clampFollowDistance, headingFromYaw,
  headingOfTravel, turnToward, avatarOpacity, flightFadeIn, flightFadeOut, establishingPose,
  createThirdPersonRig, initialView, storeView,
} from './sceneThirdPerson';
import ScenePlacesModal from './ScenePlacesModal';
import SceneEventsModal from './SceneEventsModal';
import SceneSourcesModal from './SceneSourcesModal';
import './Scene.css';

// Immersive route for a reconstructed biblical site, walked in first person —
// or, in a scene that opts in (sceneModules.js), from behind the visitor's own
// figure. Layout hides its chrome (see the immersive check in Layout.jsx) so
// the scene fills the device and provides its own Exit control, the same
// contract /reels and /atlas use.
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

// The same 760px the stylesheet calls a phone, asked of the same media engine,
// so the layout and the state that assumes it can never disagree.
function isPhoneViewport() {
  return Boolean(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Camera direction convention shared with src/lib/scenes.js: yaw 0 looks down
// -Z (west, at the sanctuary), which is also three.js's default, so a vantage
// staring straight at the temple needs no correction. `aimFrom` lives in
// sceneThirdPerson.js so the third-person vantage maths its tests check is the
// same function this route runs.

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

// Metres per second. A natural walk (1.6 m/s) and brisk walk (3.6 m/s),
// with a jog (8.5 m/s) for quickly traversing large distances.
const NATURAL_WALK_SPEED = 1.6;
const BRISK_WALK_SPEED = 3.6;
const RUN_SPEED = 8.5;
const ARRIVED = 0.6;

// A tap is a touch that goes nowhere and does not linger; anything else is a
// drag, and drags look around.
const TAP_SLOP_PX = 9;
const TAP_MS = 400;

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown']);

// --- embodiment -----------------------------------------------------------
// A camera that glides at a constant height reads as a drone. These numbers
// give it a body: a stride to bob on, a spring to land on, and a breath to
// stand still with. They are small on purpose — head bob that you notice is
// head bob that makes people ill.

// Metres per footfall. Everything about the walk cycle is measured in distance
// rather than in time, so the cadence stays right whether you are strolling or
// running and stops dead on the frame you do.
const STRIDE = 0.82;
const BOB_VERTICAL = 0.031;
const BOB_LATERAL = 0.024;
const BOB_ROLL = 0.008;
// Standing perfectly still is the one thing a living body never does.
const BREATH_RATE = 0.85;
const BREATH_DEPTH = 0.011;
// A drop of more than this much floor in one frame is a step down worth
// feeling in the knees.
const DROP_NOTICED = 0.12;
const DIP_STIFFNESS = 30;
const DIP_DAMPING = 8;
// Degrees of extra field of view while running, which is most of what reads as
// speed without touching the walk rate.
const RUN_FOV_KICK = 5;

// How quickly the figure's body settles onto a new tread, seconds.
const BODY_STEP_SECONDS = 0.07;

// The first-person near plane. The third-person one is much closer (see
// THIRD_PERSON_NEAR) and the two are swapped with the view.
const FIRST_PERSON_NEAR = 0.5;

// --- the third-person view -----------------------------------------------
// The maths is in sceneThirdPerson.js. What is here is only the wiring: which
// engine state it reads, and the reused objects it is handed every frame so
// the render loop does not mint two fresh ones sixty times a second.

// A scene can offer the view and still not have it — the figure's module may
// have failed to load, or there may be nowhere to stand — and every branch
// below asks this one question rather than trusting the view name alone.
function isThirdPerson(engine) {
  return Boolean(engine && engine.view === 'third' && engine.avatar && engine.rig && engine.walker);
}

function rigFrame(engine, dt, yaw = engine.yaw, pitch = engine.pitch) {
  const { walker, camera } = engine;
  const frame = engine.rigFrame;
  frame.dt = dt;
  frame.x = walker.x;
  frame.y = walker.height + PIVOT_HEIGHT;
  frame.z = walker.z;
  frame.walkerFloor = walker.height;
  frame.yaw = yaw;
  frame.pitch = pitch;
  frame.distance = engine.followDistance;
  frame.fov = engine.fovDefault + engine.fovKick;
  frame.aspect = camera.aspect;
  frame.near = camera.near;
  frame.reduced = engine.reduced;
  return frame;
}

function driveAvatar(engine, dt, x, y, z, heading, travelled) {
  const frame = engine.avatarFrame;
  frame.delta = dt;
  frame.x = x;
  frame.y = y;
  frame.z = z;
  frame.heading = heading;
  frame.travelled = travelled;
  frame.running = engine.running;
  frame.reducedMotion = engine.reduced;
  return engine.avatar.update(frame);
}

// Fades the figure out where it stood and back in where it lands, so a flight
// between vantages is a camera move with a person at each end rather than a
// figure sliding across the village. The opening shot keeps it in place: that
// flight is the camera arriving at someone already standing there.
function poseAvatarInFlight(engine, move, t, dt) {
  let body = engine.walker;
  let heading = engine.heading;
  let fade = 1;
  if (move.avatar !== 'stay') {
    if (move.avatarFrom && t < 0.5) {
      body = move.avatarFrom;
      heading = move.avatarFrom.heading;
      fade = flightFadeOut(t);
    } else {
      fade = flightFadeIn(t);
    }
  }
  engine.bodyY = body.height;
  driveAvatar(engine, dt, body.x, body.height, body.z, heading, 0);
  engine.avatar.getHeadPosition(engine.head);
  engine.avatar.setOpacity(fade * avatarOpacity(engine.camera.position.distanceTo(engine.head)));
}

function clampPitchFor(engine, pitch) {
  return isThirdPerson(engine)
    ? clampThirdPersonPitch(pitch)
    : Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch));
}

// What the controls are, in the words of whichever view is showing. First
// person reads exactly as it always has, plus the one key that leaves it where
// there is somewhere to go.
function controlsHint({ third, coarse, canSwitch }) {
  if (third) {
    return coarse
      ? 'Drag to look · tap the ground to walk there · pinch to move the camera in or out'
      : 'Drag to look · WASD to walk · Shift to jog · scroll to move the camera in or out · V to switch view';
  }
  if (coarse) return 'Drag to look · tap the ground to walk there';
  return canSwitch
    ? 'Drag to look · WASD to walk · click the ground to go there · V to see yourself'
    : 'Drag to look · WASD to walk · click the ground to go there';
}

function stageLabel(title, { third, canSwitch }) {
  if (third) {
    return `${title}, seen from behind your own figure. Drag to look around, or turn with the left and `
      + 'right arrow keys. Walk with W, A, S and D or the up and down arrows, and hold Shift to jog. '
      + 'Scroll or pinch to move the camera closer or further, tilt with Page Up and Page Down, and '
      + 'press V to switch to a first-person view.';
  }
  return `${title}. Drag to look around, or turn with the left and right arrow keys. `
    + 'Walk with W, A, S and D or the up and down arrows, and tilt with Page Up and Page Down.'
    + (canSwitch ? ' Press V to see yourself from behind.' : '');
}

// --- builder hooks --------------------------------------------------------
// Optional things a scene's builder can offer the route. None is required, and
// a builder that offers none behaves exactly as every scene did before them.

// The builder's own fog for an hour, in linear colour, when it has one.
function applyBuilderFog(THREE, fog, built, time) {
  const own = built.fogFor?.(time);
  if (own?.color) {
    fog.color.setRGB(own.color[0], own.color[1], own.color[2], THREE.LinearSRGBColorSpace);
    fog.density = own.density ?? fog.density;
    return true;
  }
  return false;
}

// Keeps a tight sun shadow centred on the visitor instead of stretching one
// map over the whole site. A fixed ±110 m frustum puts about ten centimetres
// in every shadow texel, which smears the one shadow that is always in frame —
// the visitor's own. The centre is snapped to the texel grid in the light's
// own axes, or the shadows would crawl as the visitor walks.
function followShadow(engine) {
  const { built } = engine;
  const sun = built.sun;
  const direction = built.lighting?.uniforms?.uSun?.value;
  const anchor = engine.walker;
  if (!sun?.shadow || !direction || !anchor) return;
  const shadow = engine.shadowFollow;
  const extent = built.shadowFollow.extent;
  const camera = sun.shadow.camera;
  if (camera.right !== extent) {
    camera.left = -extent;
    camera.right = extent;
    camera.top = extent;
    camera.bottom = -extent;
    camera.updateProjectionMatrix();
  }
  const { forward, right, up, point } = shadow;
  forward.copy(direction).normalize().negate();
  right.set(0, 1, 0).cross(forward);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  up.crossVectors(forward, right);
  const texel = (2 * extent) / (sun.shadow.mapSize?.x || 2048);
  point.set(anchor.x, anchor.height, anchor.z);
  const a = Math.round(point.dot(right) / texel) * texel;
  const b = Math.round(point.dot(up) / texel) * texel;
  const c = point.dot(forward);
  point.copy(right).multiplyScalar(a).addScaledVector(up, b).addScaledVector(forward, c);
  sun.target.position.copy(point);
  sun.position.copy(point).addScaledVector(direction, 220);
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
}

const MUTE_KEY = 'miqra_scene_muted';

function storedMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function storeMuted(value) {
  try {
    window.localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // A browser refusing storage is not a reason to refuse sound.
  }
}

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
  const location = useLocation();
  const scene = useMemo(() => resolveScene(slug), [slug]);
  // Each scene brings its own collision model and its own geometry; the route
  // itself knows nothing about which site it is showing.
  const modules = sceneModule(scene?.slug);
  const {
    stanceAt, move: stepMove, groundPointAlongRay, BARRIERS, enclosureAt,
  } = modules?.navigation ?? {};
  const disclaimer = scene?.disclaimer || SCENE_DISCLAIMER;
  // A link straight to something in the scene (?event=, ?at=, ?pin=) — how the
  // scripture reader sends a reader to where a passage happened. The scene
  // opens there, staged at its hour; a later link while inside flies to it.
  const link = useMemo(() => resolveSceneLink(scene, location.search), [scene, location.search]);
  const [openingLink] = useState(link);
  const appliedLinkRef = useRef(link);

  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  // Imperative handles the render loop owns. Nothing here belongs in state:
  // it changes every frame, and re-rendering React 60 times a second to move a
  // label would cost more than the scene itself.
  const engineRef = useRef(null);
  const hotspotElsRef = useRef(new Map());
  const walkMarkerRef = useRef(null);
  // The tour flies the camera by calling goToVantage, which is declared below
  // it; the ref is what lets the two refer to each other without either being
  // hoisted out of the order it reads best in.
  const goToVantageRef = useRef(null);
  // Read from the render loop, which is built once and must never close over a
  // stale copy of the tour's stop function.
  const tourStopRef = useRef(null);
  const stickRef = useRef(null);
  const knobRef = useRef(null);

  // Resolved before the first paint rather than in the effect: whether this
  // device can render at all is a property of the browser, not something the
  // effect discovers, and setting it from inside one costs a cascading render.
  const [status, setStatus] = useState(() => (webglAvailable() ? 'loading' : 'unsupported'));
  // loading | ready | unsupported | error
  const [entered, setEntered] = useState(false);
  const [vantageId, setVantageId] = useState(() => {
    if (openingLink) return openingLink.kind === 'vantage' ? openingLink.target.id : null;
    return defaultVantage(scene)?.id || null;
  });
  const [panel, setPanel] = useState(null); // { kind: 'vantage' | 'hotspot' | 'barrier', data }
  const panelRef = useRef(panel);
  useEffect(() => { panelRef.current = panel; }, [panel]);

  const [coarse] = useState(hasCoarsePointer);
  const [muted, setMuted] = useState(storedMuted);
  const [hasAudio] = useState(audioAvailable);
  // Deliberately not persisted. Morning is each site's curated first
  // impression — the hour the vantage blurbs describe — and someone returning
  // a month later should get that rather than the dusk they once tried.
  // A link to an event opens at that event's hour instead.
  const [timeOfDay, setTimeOfDay] = useState(openingLink?.hour || scene?.defaultTimeOfDay || DEFAULT_TIME_OF_DAY);
  // Read at boot so the builder starts at the right hour without the renderer
  // effect depending on it — a rebuild per hour would be absurd.
  const timeOfDayRef = useRef(openingLink?.hour || scene?.defaultTimeOfDay || DEFAULT_TIME_OF_DAY);

  // First person, or from behind the visitor's own figure. Only a scene that
  // opts in (sceneModules.js) offers the second, and it opens in whichever the
  // visitor last chose there. If the figure cannot be built the choice quietly
  // collapses to first person rather than offering a view with nobody in it.
  const [view, setView] = useState(() => initialView(scene?.slug, modules));
  const [avatarMissing, setAvatarMissing] = useState(false);
  const canThirdPerson = Boolean(modules?.thirdPerson) && !avatarMissing;
  const activeView = canThirdPerson ? view : 'first';
  // The boot effect reads this rather than depending on the view, for the
  // same reason it reads the hour through a ref.
  const viewRef = useRef(activeView);

  // Phase 2, 5 & 6 settings and modal states
  const [fastWalk, setFastWalk] = useState(false);
  const [quietMode, setQuietMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // The blurb is the longest thing on the screen and on a phone it covers most
  // of what the visitor came to look at, so it folds down to its title line.
  // Sticky on purpose: collapsed stays collapsed until they open it again,
  // including across vantages, because "stop putting text over the scene" is a
  // standing instruction rather than a per-stop one. During the walk it is also
  // the only way out — closing the panel there is undone by the next stop.
  // Folded away to its title line on a phone from the start, because there the
  // expanded blurb is most of the view and the visitor came to look. Open on a
  // desktop, where the panel is a card in the corner and costs nothing.
  const [panelCollapsed, setPanelCollapsed] = useState(isPhoneViewport);
  const [showPlaces, setShowPlaces] = useState(false);
  // Which of the scene's events is staged (Capernaum's; see capernaumEvents.js).
  const [eventId, setEventId] = useState(() => openingLink?.eventId || scene?.defaultEvent || null);
  const [showEvents, setShowEvents] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [userQuality, setUserQuality] = useState(getStoredQuality);
  const userQualityRef = useRef(userQuality);
  useEffect(() => {
    userQualityRef.current = userQuality;
    const profile = resolveQualityProfile(userQuality);
    engineRef.current?.built?.applyQuality?.(profile);
  }, [userQuality]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.fastWalk = fastWalk;
      engineRef.current.quietMode = quietMode;
    }
  }, [fastWalk, quietMode]);

  const handleExit = useCallback(() => {
    const returnState = location.state?.sceneReturnContext;
    // Sent here from the scripture reader: go back to where the reader was
    // opened, and open it again at the passage.
    if (returnState?.source === 'scripture') {
      if (location.key !== 'default') navigate(-(returnState.depth || 1));
      else navigate(returnState.from || '/');
      if (returnState.ref) {
        window.dispatchEvent(new CustomEvent('scripture:open', { detail: { ref: returnState.ref } }));
      }
      return;
    }
    if (returnState) {
      navigate('/atlas', { state: { atlasSavedState: returnState } });
    } else {
      navigate('/atlas');
    }
  }, [navigate, location.state, location.key]);

  const handleQualityChange = useCallback((q) => {
    setStoredQuality(q);
    setUserQuality(q);
    const p = resolveQualityProfile(q);
    const engine = engineRef.current;
    if (engine) {
      engine.quality = p.name;
      engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatioCeiling));
      engine.renderer.shadowMap.enabled = p.shadowMapSize > 0;
      engine.built?.applyQuality?.(p);
    }
  }, []);

  // Built on the "Step inside" click, because that is the only real user
  // gesture the route gets, and a browser will not let an AudioContext start
  // without one. Muted still builds it, so that unmuting later is instant.
  const startAudio = useCallback((startMuted) => {
    const engine = engineRef.current;
    if (!engine || engine.audio || !audioAvailable()) return;
    const soundscape = createSoundscape(scene?.slug, { quality: engine.quality });
    if (!soundscape) return;
    soundscape.setMuted(startMuted);
    soundscape.setTimeOfDay?.(timeOfDayRef.current);
    engine.audio = soundscape;
    soundscape.resume();
  }, [scene]);

  const registerHotspot = useCallback((id, element) => {
    if (element) hotspotElsRef.current.set(id, element);
    else hotspotElsRef.current.delete(id);
  }, []);

  useEffect(() => {
    storeMuted(muted);
    engineRef.current?.audio?.setMuted(muted);
  }, [muted]);

  // --- boot the renderer --------------------------------------------------

  useEffect(() => {
    if (!scene || status === 'unsupported') return undefined;

    let disposed = false;
    let cleanup = () => {};

    (async () => {
      let THREE;
      let buildScene;
      let postModules;
      let avatarModule;
      try {
        [THREE, { default: buildScene }, avatarModule] = await Promise.all([
          import('three'),
          modules.loadBuilder(),
          // The visitor's own figure, fetched only by a scene that can be seen
          // from behind one and in parallel with three.js, so it costs the
          // others nothing and this one no extra wait. Failing to load it
          // costs the view, never the scene.
          modules.thirdPerson ? import('./scenePlayerAvatar').catch(() => null) : null,
        ]);
        // The image chain is a nicety: a device that cannot load it still gets
        // the scene, just flatter. Failing to fetch it must never fail the route.
        postModules = await loadPostProcessing().catch(() => null);
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

      const profile = resolveQualityProfile(userQualityRef.current);
      const quality = profile.name;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.pixelRatioCeiling));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      if (profile.shadowMapSize > 0) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }

      const world = new THREE.Scene();
      // Warm haze. The sky is a custom ShaderMaterial with no fog chunk, so it
      // stays clear while everything on the ground softens with distance —
      // which is what sells the size of the platform.
      world.fog = new THREE.FogExp2(0xd8c8a6, 0.0013);

      const camera = new THREE.PerspectiveCamera(60, 1, FIRST_PERSON_NEAR, 2400);
      camera.rotation.order = 'YXZ';

      const built = buildScene(THREE, {
        quality,
        maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
        reducedMotion: prefersReducedMotion(),
        timeOfDay: timeOfDayRef.current,
      });
      if (built.fog) world.fog = new THREE.FogExp2(built.fog.color, built.fog.density);
      if (built.exposure) renderer.toneMappingExposure = built.exposure;
      world.add(built.root);
      // A builder that draws its own sky can say what colour its haze is, so
      // distant geometry dissolves into that sky rather than into a colour
      // picked separately for it. See "builder hooks" in CLAUDE.md.
      if (world.fog && built.lighting?.current) applyBuilderFog(THREE, world.fog, built, built.lighting.current);
      // Anything that needs the renderer itself — an environment map baked
      // from the sky, say. A failure here costs the nicety, never the scene.
      try {
        built.prepareRenderer?.(renderer, world);
      } catch {
        // Carry on without it.
      }

      // Asset session loading. The figure wants some of these groups too, and
      // can come into being after a few of them have already arrived, so every
      // group is kept and replayed into it once it exists; after that each new
      // one is handed straight over.
      const assetGroups = [];
      let avatar = null;
      const assetSession = createAssetSession(scene.slug, {
        onGroupLoaded: (group) => {
          if (disposed) return;
          built.applyAssets?.(group);
          if (modules.thirdPerson) assetGroups.push(group);
          avatar?.acceptAssets(group);
        },
      });
      assetSession.loadAllGroupsSequentially().catch((err) => {
        console.warn('[sceneAssets] Background sequential loading stopped:', err);
      });

      if (avatarModule?.createPlayerAvatar) {
        try {
          avatar = avatarModule.createPlayerAvatar(THREE, {
            parent: world,
            quality,
            reducedMotion: prefersReducedMotion(),
          });
          assetGroups.forEach((group) => avatar.acceptAssets(group));
        } catch {
          avatar = null;
        }
      }
      if (modules.thirdPerson && !avatar) setAvatarMissing(true);
      // What the camera may not pass through. A scene can name a set for the
      // camera specifically; the hotspot occluders are a fair stand-in, being
      // the walls and roofs a line of sight must not cross either.
      const rig = avatar
        ? createThirdPersonRig(THREE, {
          colliders: built.cameraColliders ?? built.occluders ?? [],
          floorAt: modules.navigation.floorAt,
        })
        : null;

      const hotspotManager = createHotspotOcclusionManager(built.occluders || []);
      const resolutionManager = createResolutionManager({
        initialScale: 1.0,
        minScale: 0.6,
        onScaleChange: (scale) => {
          if (renderer && stage) {
            const w = stage.clientWidth * scale;
            const h = stage.clientHeight * scale;
            renderer.setSize(w, h, false);
            post?.setSize(stage.clientWidth, stage.clientHeight);
          }
        },
      });

      const start = openingLink?.standpoint || defaultVantage(scene);
      const aim = aimFrom(start.position, start.lookAt);
      camera.position.set(...start.position);
      camera.rotation.set(aim.pitch, aim.yaw, 0);

      const engine = {
        THREE,
        renderer,
        world,
        camera,
        built,
        assetSession,
        hotspotManager,
        resolutionManager,
        yaw: aim.yaw,
        pitch: aim.pitch,
        // Framed for the shape of this screen rather than at a fixed 60°, so a
        // portrait phone starts wide enough to see what it is standing in
        // front of. See sceneFraming.js.
        fov: defaultFovForElement(stage),
        // Cleared until the visitor pinches or scrolls; a reframe on rotation
        // is only ever allowed to overwrite the default.
        fovUser: false,
        transition: null,
        reduced: prefersReducedMotion(),
        projected: new THREE.Vector3(),
        anchor: new THREE.Vector3(),
        visibleHotspots: new Set(),
        fastWalk,
        quietMode,
        // Where the visitor is standing. The camera is derived from this every
        // frame rather than being moved directly, so collision has exactly one
        // place to say no.
        walker: stanceAt(start.position[0], start.position[2], start.position[1] - EYE_HEIGHT),
        eyeY: start.position[1],
        keys: new Set(),
        running: false,
        stick: { x: 0, y: 0 },
        walkTarget: null,
        quality,
        vantageActive: true,
        lastBarrier: { id: null, at: 0 },
        // --- the body ---
        // Advances with distance walked, not with time. One footfall per PI.
        bobPhase: 0,
        lastStep: 0,
        // How much of the walk cycle is showing, eased so that starting and
        // stopping are not a switch.
        bobBlend: 0,
        roll: 0,
        // A spring in the legs for the frame you step off something.
        dip: 0,
        dipVelocity: 0,
        lastFloor: start.position[1] - EYE_HEIGHT,
        fovKick: 0,
        audio: null,
        // --- the third-person view ---
        view: avatar && viewRef.current === 'third' ? 'third' : 'first',
        avatar,
        rig,
        // The figure's facing, in three.js's model convention — not a camera
        // yaw. See sceneThirdPerson.js.
        heading: headingFromYaw(aim.yaw),
        // Scroll and pinch move the camera rather than zooming the lens in
        // this view, so the lens stays on the framing default below.
        followDistance: FOLLOW_DISTANCE,
        fovDefault: defaultFovForElement(stage),
        head: new THREE.Vector3(),
        rigFrame: {
          dt: 0, x: 0, y: 0, z: 0, walkerFloor: 0, yaw: 0, pitch: 0,
          distance: FOLLOW_DISTANCE, fov: 60, aspect: 1, near: THIRD_PERSON_NEAR, reduced: false,
        },
        avatarFrame: {
          delta: 0, x: 0, y: 0, z: 0, heading: 0, travelled: 0, running: false, reducedMotion: false,
        },
        // Handed to built.update every frame, reused rather than rebuilt.
        builtFrame: { camera, walker: null, view: 'first' },
        shadowFollow: built.shadowFollow ? {
          forward: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), point: new THREE.Vector3(),
        } : null,
      };
      engineRef.current = engine;

      let post = null;
      try {
        post = createPostProcessing(THREE, postModules, {
          renderer,
          world,
          camera,
          width: stage.clientWidth,
          height: stage.clientHeight,
          quality,
          reducedMotion: engine.reduced,
        });
      } catch {
        // A driver that will not compile the AO shader is a flatter scene, not
        // a broken one.
        post = null;
      }
      engine.post = post;

      const resize = () => {
        const { clientWidth, clientHeight } = stage;
        if (!clientWidth || !clientHeight) return;
        renderer.setSize(clientWidth, clientHeight, false);
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
        post?.setSize(clientWidth, clientHeight);
        // Turning a phone on its side changes what the framing owes the
        // visitor, so the default is re-derived — unless they have set their
        // own, which outranks it but still has to fit the new limits: portrait
        // may zoom out further than landscape does.
        engine.fov = engine.fovUser
          ? clampFov(engine.fov, camera.aspect)
          : defaultFovForElement(stage);
        engine.fovDefault = defaultFovForElement(stage);
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(stage);

      // Opening in third person: the figure is put down at the default
      // vantage facing what it is about, and the camera starts high over the
      // village behind it — held there behind the intro card until "Step
      // inside", then flown down to the shoulder. Under reduced motion there
      // is no flight; the camera simply starts where the flight would end.
      if (engine.view === 'third' && engine.walker) {
        camera.near = THIRD_PERSON_NEAR;
        camera.updateProjectionMatrix();
        const opening = thirdPersonAim(start.position, start.lookAt);
        engine.yaw = opening.yaw;
        engine.pitch = opening.pitch;
        engine.heading = opening.heading;
        const settled = rig.settle(rigFrame(engine, 0)).toArray();
        if (engine.reduced) {
          camera.position.fromArray(settled);
        } else {
          const aerial = establishingPose({
            x: engine.walker.x,
            y: engine.walker.height + PIVOT_HEIGHT,
            z: engine.walker.z,
          }, opening.yaw);
          camera.position.fromArray(aerial.position);
          engine.yaw = aerial.yaw;
          engine.pitch = aerial.pitch;
          engine.transition = {
            from: aerial,
            to: { position: settled, yaw: opening.yaw, pitch: opening.pitch },
            yawDelta: shortestAngle(aerial.yaw, opening.yaw),
            elapsed: 0,
            duration: ESTABLISHING.seconds,
            held: true,
            avatar: 'stay',
          };
        }
        camera.rotation.set(engine.pitch, engine.yaw, 0);
      } else {
        engine.view = 'first';
        avatar?.setVisible(false);
      }

      // --- render loop ------------------------------------------------------
      let frame = 0;
      let last = performance.now();
      const clockStart = last;

      const tick = (now) => {
        frame = requestAnimationFrame(tick);
        const dt = Math.min((now - last) / 1000, 0.1);
        const elapsed = (now - clockStart) / 1000;
        last = now;
        if (document.hidden) return;

        const third = isThirdPerson(engine);
        const move = engine.transition;
        if (move) {
          // A held flight is the opening shot, waiting behind the intro card
          // for "Step inside".
          if (!move.held) move.elapsed += dt;
          const t = engine.reduced ? 1 : Math.min(move.elapsed / move.duration, 1);
          const e = easeInOut(t);
          camera.position.set(
            move.from.position[0] + (move.to.position[0] - move.from.position[0]) * e,
            move.from.position[1] + (move.to.position[1] - move.from.position[1]) * e,
            move.from.position[2] + (move.to.position[2] - move.from.position[2]) * e,
          );
          engine.yaw = move.from.yaw + move.yawDelta * e;
          engine.pitch = move.from.pitch + (move.to.pitch - move.from.pitch) * e;
          // The walk cycle is frozen for the duration of the flight, so its
          // last frame's roll would otherwise fly the camera to the vantage
          // with a tilted horizon. Both ease out instead.
          engine.bobBlend += (0 - engine.bobBlend) * Math.min(1, dt * 6);
          engine.roll += (0 - engine.roll) * Math.min(1, dt * 6);
          if (third) poseAvatarInFlight(engine, move, t, dt);
          if (t >= 1) {
            engine.transition = null;
            if (third) {
              // The figure was put down at the destination when the flight
              // began, and the flight ended exactly on the rig's own answer
              // for it, so the rig simply carries on from here.
              engine.rig.settle(rigFrame(engine, 0));
              engine.eyeY = engine.walker.height + EYE_HEIGHT;
              engine.lastFloor = engine.walker.height;
            } else {
              // Hand the walker the ground under wherever the flight landed, so
              // the first step after a fast travel starts from the right floor.
              const landed = stanceAt(move.to.position[0], move.to.position[2], move.to.position[1] - EYE_HEIGHT);
              if (landed) engine.walker = landed;
              engine.eyeY = camera.position.y;
              engine.lastFloor = engine.walker?.height ?? engine.lastFloor;
            }
          }
        } else if (engine.walker) {
          // --- walking ------------------------------------------------------
          // How far the body actually travelled this frame — which is what
          // drives the walk cycle, and is not the same as how far it was asked
          // to travel once a wall has had its say.
          let travelled = 0;
          let stepX = 0;
          let stepZ = 0;
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
            const walkSpeed = engine.fastWalk ? BRISK_WALK_SPEED : NATURAL_WALK_SPEED;
            // Seen from behind, Shift is a jog: the figure has a jog to show
            // and no sprint, and legs cycling at a jog across ground covered
            // at twice that speed would skate.
            const runSpeed = third ? JOG_SPEED : RUN_SPEED;
            const speed = (engine.running ? runSpeed : walkSpeed) * Math.min(1, magnitude);
            const scale = (speed * dt) / magnitude;
            const before = engine.walker;
            let stepped = stepMove(before, vx * scale, vz * scale);
            const clearance = built.humans?.queryClearance(stepped.x, stepped.z, 0.35, stepped.height);
            // A crowd that refuses to let you past can name itself. Only a
            // dead stop counts — sliding along a shoulder is not a refusal.
            const crowdBarrier = clearance?.collides ? clearance.barrier : null;
            if (clearance?.collides) {
              const adjusted = stepMove(stepped, clearance.pushX, clearance.pushZ);
              stepped = built.humans.queryClearance(adjusted.x, adjusted.z, 0.34, adjusted.height).collides
                ? before : adjusted;
            }
            const moved = stepped.x !== before.x || stepped.z !== before.z;
            stepX = stepped.x - before.x;
            stepZ = stepped.z - before.z;
            travelled = Math.hypot(stepX, stepZ);
            engine.walker = stepped;

            if (moved && engine.vantageActive) {
              engine.vantageActive = false;
              setVantageId(null);
              // Walking off under your own steam ends the guided walk. Being
              // narrated at while you wander somewhere else is worse than
              // silence.
              tourStopRef.current?.();
            }
            // Grinding against a wall on the way to a tapped destination means
            // the destination is not reachable from here; give up on it rather
            // than shuffling in place.
            if (!moved) engine.walkTarget = null;

            const barrier = BARRIERS[stepped.blocked] || (!moved && crowdBarrier ? BARRIERS[crowdBarrier] : null);
            if (barrier && (engine.lastBarrier.id !== barrier.id || now - engine.lastBarrier.at > 12000)) {
              engine.lastBarrier = { id: barrier.id, at: now };
              setPanel({ kind: 'barrier', data: barrier });
            }
          }

          // Smoothed so the stairs are a ramp underfoot rather than a series of
          // jolts, and so a floor change on arrival eases in.
          const targetEye = engine.walker.height + EYE_HEIGHT;
          engine.eyeY += (targetEye - engine.eyeY) * Math.min(1, dt * 9);

          if (third) {
            // --- the figure ------------------------------------------------
            // It turns toward where it actually went — which, once a wall has
            // had its say, is not always where it was pointed — and standing
            // still it keeps facing wherever it last faced.
            if (travelled > 1e-4) {
              engine.heading = turnToward(engine.heading, headingOfTravel(stepX, stepZ), dt);
            }
            // Stairs are walked on their treads, so the floor under the figure
            // rises a riser at a time; the body follows it over a few frames
            // rather than hopping, which is what stepping up looks like.
            engine.bodyY = Number.isFinite(engine.bodyY) && !engine.reduced
              ? engine.walker.height + (engine.bodyY - engine.walker.height) * Math.exp(-dt / BODY_STEP_SECONDS)
              : engine.walker.height;
            if (Math.abs(engine.bodyY - engine.walker.height) > 0.6) engine.bodyY = engine.walker.height;
            const gait = driveAvatar(
              engine, dt, engine.walker.x, engine.bodyY, engine.walker.z, engine.heading, travelled,
            );
            // Footsteps come from the figure's own heel strikes rather than
            // from a stride counter, so what is heard lands on what is seen.
            // Sound, so not suppressed under reduced motion — see below.
            if (gait?.footfalls > 0) {
              engine.audio?.footstep(surfaceForRegion(engine.walker.region), engine.running ? 1 : 0.82);
            }
            const dropped = engine.lastFloor - engine.walker.height;
            // A continuous downhill slope is already covered by heel strikes.
            if (dropped > Math.max(DROP_NOTICED, travelled * 0.9)) {
              engine.audio?.footstep(surfaceForRegion(engine.walker.region), 1.1);
            }
            engine.lastFloor = engine.walker.height;
            // Only the run kick reads this in this view; there is no head bob
            // to blend, because the figure's gait is the walk you see.
            engine.bobBlend += ((travelled > 0 ? 1 : 0) - engine.bobBlend) * Math.min(1, dt * 8);
            engine.roll = 0;

            camera.position.copy(engine.rig.update(rigFrame(engine, dt)));
            engine.avatar.getHeadPosition(engine.head);
            engine.avatar.setOpacity(avatarOpacity(camera.position.distanceTo(engine.head)));
          } else {
            // --- the walk cycle ----------------------------------------------
            // Phase advances with distance rather than time: a footfall every
            // STRIDE metres, at any speed, and none at all while standing still.
            if (travelled > 0) {
              engine.bobPhase += (travelled / STRIDE) * Math.PI;
              const step = Math.floor(engine.bobPhase / Math.PI);
              if (step !== engine.lastStep) {
                engine.lastStep = step;
                // Footsteps are sound, not motion, so they are not suppressed
                // for a visitor who asked for reduced motion — they are the main
                // thing telling that visitor they are moving at all.
                engine.audio?.footstep(
                  surfaceForRegion(engine.walker.region),
                  engine.running ? 1 : 0.82,
                );
              }
            }
            engine.bobBlend += ((travelled > 0 ? 1 : 0) - engine.bobBlend) * Math.min(1, dt * 8);

            // Stepping off something lands in the knees and springs back.
            const dropped = engine.lastFloor - engine.walker.height;
            if (dropped > Math.max(DROP_NOTICED, travelled * 0.9)) {
              engine.dipVelocity -= Math.min(dropped, 0.6) * 1.7;
              engine.audio?.footstep(surfaceForRegion(engine.walker.region), 1.1);
            }
            engine.lastFloor = engine.walker.height;
            engine.dipVelocity += (-engine.dip * DIP_STIFFNESS - engine.dipVelocity * DIP_DAMPING) * dt;
            engine.dip = Math.min(0.1, Math.max(-0.35, engine.dip + engine.dipVelocity * dt));

            const amplitude = engine.reduced ? 0 : engine.bobBlend * (engine.running ? 1.45 : 1);
            // Vertical bobs once per foot; the sway and the roll go once per
            // pair, which is why a walk reads as a walk and not as a jog on the
            // spot.
            const bobY = Math.sin(engine.bobPhase * 2) * BOB_VERTICAL * amplitude;
            const bobX = Math.cos(engine.bobPhase) * BOB_LATERAL * amplitude;
            engine.roll = Math.sin(engine.bobPhase) * BOB_ROLL * amplitude;
            const breath = engine.reduced
              ? 0
              : Math.sin(elapsed * BREATH_RATE) * BREATH_DEPTH * (1 - engine.bobBlend);

            camera.position.set(
              engine.walker.x + rightX * bobX,
              engine.eyeY + bobY + breath + engine.dip,
              engine.walker.z + rightZ * bobX,
            );
          }
        }

        camera.rotation.set(engine.pitch, engine.yaw, engine.roll);
        // The kick is additive rather than a write to engine.fov, which is the
        // visitor's own zoom and must survive a sprint. In third person the
        // lens stays on the framing default — scrolling moves the camera
        // instead — and the kick rides on that.
        const wantKick = engine.running && engine.bobBlend > 0.3 && !engine.reduced ? RUN_FOV_KICK : 0;
        engine.fovKick += (wantKick - engine.fovKick) * Math.min(1, dt * 4);
        const fov = (third ? engine.fovDefault : engine.fov) + engine.fovKick;
        if (camera.fov !== fov) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }

        if (userQualityRef.current === 'auto') {
          resolutionManager.sample(dt);
        }

        built.humans?.update({
          elapsed,
          delta: dt,
          camera,
          quality: engine.quality,
          reducedMotion: prefersReducedMotion(),
        });
        engine.builtFrame.walker = engine.walker;
        engine.builtFrame.view = engine.view;
        built.update(built.humans?.getElapsed?.() ?? elapsed, dt, engine.builtFrame);
        if (engine.shadowFollow) followShadow(engine);
        // The ears are the figure's, not the lens's: in third person the
        // camera can be three metres back and round a corner, and the lake
        // should be heard from where the visitor is standing. The camera's yaw
        // still decides left from right, because that is the picture the
        // sound has to agree with. During a flight the ears ride with the
        // camera, as they do in first person.
        const ears = third && !engine.transition ? engine.head : camera.position;
        engine.audio?.update(elapsed, {
          x: ears.x,
          y: ears.y,
          z: ears.z,
          yaw: engine.yaw,
          // A scene that has enclosed places says so; one that has none does
          // not have to know the question was asked.
          enclosure: engine.walker && enclosureAt
            ? enclosureAt(engine.walker.x, engine.walker.z, engine.walker.height)
            : 0,
        });
        if (post) post.render(elapsed, dt);
        else renderer.render(world, camera);

        // Project the anchored labels to screen space with occlusion & quiet mode
        const width = stage.clientWidth;
        const height = stage.clientHeight;

        const pins = engine.hotspots || scene.hotspots;
        if (engine.quietMode) {
          for (const hotspot of pins) {
            const el = hotspotElsRef.current.get(hotspot.id);
            if (el && el.style.display !== 'none') {
              el.style.display = 'none';
            }
          }
        } else {
          const visibleMap = hotspotManager.evaluateHotspots({
            camera,
            hotspots: pins,
            width,
            height,
            activeId: panelRef.current?.kind === 'hotspot' ? panelRef.current.data.id : null,
            previouslyVisible: engine.visibleHotspots,
          });
          engine.visibleHotspots = new Set(visibleMap.keys());

          for (const hotspot of pins) {
            const el = hotspotElsRef.current.get(hotspot.id);
            if (!el) continue;
            const placed = visibleMap.get(hotspot.id);
            if (placed) {
              el.style.display = '';
              el.style.transform = `translate(-50%, -50%) translate(${placed.x}px, ${placed.y}px)`;
            } else if (el.style.display !== 'none') {
              el.style.display = 'none';
            }
          }
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
        engine.audio?.dispose();
        engine.audio = null;
        post?.dispose();
        built.humans?.dispose();
        avatar?.dispose();
        assetGroups.length = 0;
        assetSession.dispose();
        resolutionManager.reset();
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

  // Changing the hour re-points the sun, recolours the sky and moves the fog.
  // Nothing is rebuilt: the geometry is the same building at four in the
  // afternoon as it was at nine in the morning.
  useEffect(() => {
    timeOfDayRef.current = timeOfDay;
    const engine = engineRef.current;
    const time = engine?.built?.lighting?.setTimeOfDay?.(timeOfDay);
    if (!engine || !time) return;
    if (engine.world.fog && !applyBuilderFog(engine.THREE, engine.world.fog, engine.built, time)) {
      engine.world.fog.color.set(time.fog.color);
      engine.world.fog.density = time.fog.density;
    }
    engine.renderer.toneMappingExposure = time.exposure;
    // Everything else that keeps time with the sun: lamps, clouds, the water,
    // and which birds are singing.
    try {
      engine.built.onTimeOfDay?.(time);
    } catch {
      // An hour that cannot be fully applied is still an hour.
    }
    engine.audio?.setTimeOfDay?.(time.id);
  }, [timeOfDay, status]);

  // Staging an event swaps the cast the builder shows (only one at a time)
  // and which pins the render loop places.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.hotspots = hotspotsFor(scene, eventId);
    engine.built?.setEpisode?.(eventId);
  }, [eventId, status, scene]);

  const cancelTransition = useCallback((engine) => {
    if (!engine?.transition) return;
    const move = engine.transition;
    engine.transition = null;
    if (isThirdPerson(engine)) {
      // In third person the figure was put down at the destination when the
      // flight began, so there is no question of where the visitor is — only
      // the camera is still in the air. It eases the rest of the way to the
      // shoulder rather than cutting there, and the controls are live at once.
      engine.pitch = clampThirdPersonPitch(engine.pitch);
      engine.rig.settle(rigFrame(engine, 0));
      engine.rig.handoff(engine.camera.position);
      engine.eyeY = engine.walker.height + EYE_HEIGHT;
      engine.lastFloor = engine.walker.height;
      return;
    }
    const landed = stanceAt(engine.camera.position.x, engine.camera.position.z, engine.camera.position.y - EYE_HEIGHT)
      || stanceAt(move.to.position[0], move.to.position[2], move.to.position[1] - EYE_HEIGHT);
    if (landed) {
      engine.walker = landed;
      engine.eyeY = engine.camera.position.y;
      engine.lastFloor = landed.height;
    }
  }, [stanceAt]);

  // --- switching view -----------------------------------------------------

  const applyView = useCallback((engine, next) => {
    if (next === 'third' && !(engine.avatar && engine.rig && engine.walker)) return;
    // Whatever is in flight lands under the rules of the view it took off in.
    cancelTransition(engine);
    engine.view = next;
    const third = next === 'third';
    engine.camera.near = third ? THIRD_PERSON_NEAR : FIRST_PERSON_NEAR;
    engine.camera.updateProjectionMatrix();
    engine.avatar?.setVisible(third);
    if (!engine.walker) return;
    if (third) {
      engine.pitch = clampThirdPersonPitch(engine.pitch);
      // Facing the way the eyes were facing, so the switch shows the visitor
      // from behind, looking at what they were just looking at.
      engine.heading = headingFromYaw(engine.yaw);
      engine.roll = 0;
      engine.rig.settle(rigFrame(engine, 0));
      // Swings out from the eye to the shoulder rather than cutting to it.
      engine.rig.handoff(engine.camera.position);
    } else {
      engine.eyeY = engine.walker.height + EYE_HEIGHT;
      engine.lastFloor = engine.walker.height;
      engine.dip = 0;
      engine.dipVelocity = 0;
    }
  }, [cancelTransition]);

  useEffect(() => {
    viewRef.current = activeView;
    const engine = engineRef.current;
    if (!engine || engine.view === activeView) return;
    applyView(engine, activeView);
  }, [activeView, status, applyView]);

  // Lets the opening shot go, if one is waiting behind the intro card: down
  // from over the village to the visitor's shoulder.
  const releaseOpeningShot = useCallback(() => {
    const engine = engineRef.current;
    if (engine?.transition?.held) engine.transition.held = false;
  }, []);

  const toggleView = useCallback(() => {
    if (!canThirdPerson || !scene) return;
    const next = viewRef.current === 'third' ? 'first' : 'third';
    viewRef.current = next;
    storeView(scene.slug, next);
    setView(next);
  }, [canThirdPerson, scene]);

  // --- look controls ------------------------------------------------------

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || status !== 'ready') return undefined;

    const pointers = new Map();
    let pinchDistance = 0;
    let tap = null;

    const sensitivity = () => {
      const engine = engineRef.current;
      const fov = isThirdPerson(engine) ? engine.fovDefault : engine?.fov;
      return 0.0026 * ((fov || 60) / 60);
    };

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

      cancelTransition(engine);
      // In third person the ray starts at a camera that is not the eye, and
      // the rule about floors above the eye is about the figure's eye.
      const eye = isThirdPerson(engine) ? { eyeHeight: engine.walker.height + EYE_HEIGHT } : undefined;
      const hit = groundPointAlongRay(engine.camera.position, direction, undefined, eye);
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
          engine.walker.height,
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
      // Capture retargets pointerup to the stage, so remember whether the
      // gesture began on the canvas before taking it away from that target.
      tap = pointers.size === 1 && event.target === canvasRef.current
        ? { x: event.clientX, y: event.clientY, at: performance.now() }
        : null;
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
        if (pinchDistance && isThirdPerson(engine)) {
          // Seen from behind, a pinch brings the camera in or sends it back;
          // the lens stays where the framing module put it.
          cancelTransition(engine);
          engine.followDistance = clampFollowDistance(engine.followDistance * (pinchDistance / (spread || 1)));
        } else if (pinchDistance) {
          engine.fov = clampFov(engine.fov * (pinchDistance / (spread || 1)), engine.camera.aspect);
          // From here on the fov is the visitor's, so a rotation into landscape
          // must not quietly reframe it back to the default.
          engine.fovUser = true;
        }
        pinchDistance = spread;
        return;
      }

      // A deliberate drag also cancels an in-flight vantage move, so grabbing
      // the view mid-flight hands control back instead of fighting the tween.
      cancelTransition(engine);
      engine.yaw -= (event.clientX - previous.x) * sensitivity();
      engine.pitch = clampPitchFor(engine, engine.pitch - (event.clientY - previous.y) * sensitivity());
    };

    const onPointerUp = (event) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchDistance = 0;
      stage.releasePointerCapture?.(event.pointerId);
      // Only a tap that began on the world itself walks; hotspot buttons
      // handle their own gestures even though they share the capture stage.
      if (tap && performance.now() - tap.at < TAP_MS) {
        walkToTap(event.clientX, event.clientY);
      }
      tap = null;
    };

    const onWheel = (event) => {
      const engine = engineRef.current;
      if (!engine) return;
      event.preventDefault();
      if (isThirdPerson(engine)) {
        cancelTransition(engine);
        // Multiplicative, so a notch of the wheel is the same proportion of
        // the arm at two metres as at six.
        engine.followDistance = clampFollowDistance(engine.followDistance * Math.exp(event.deltaY * 0.0015));
        return;
      }
      engine.fov = clampFov(engine.fov + event.deltaY * 0.045, engine.camera.aspect);
      engine.fovUser = true;
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
      // V switches view where there is another view to switch to, and is left
      // alone everywhere else.
      if (key === 'v') {
        if (!canThirdPerson || event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        if (!event.repeat) toggleView();
        return;
      }
      if (key === 'arrowleft') engine.yaw += turn;
      else if (key === 'arrowright') engine.yaw -= turn;
      else if (key === 'pageup') {
        engine.pitch = isThirdPerson(engine)
          ? clampThirdPersonPitch(engine.pitch + turn)
          : Math.min(PITCH_MAX, engine.pitch + turn);
      } else if (key === 'pagedown') {
        engine.pitch = isThirdPerson(engine)
          ? clampThirdPersonPitch(engine.pitch - turn)
          : Math.max(PITCH_MIN, engine.pitch - turn);
      }
      else if (MOVE_KEYS.has(key)) engine.keys.add(key);
      else return;
      cancelTransition(engine);
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
  }, [status, stanceAt, groundPointAlongRay, cancelTransition, canThirdPerson, toggleView]);

  // --- vantage movement ---------------------------------------------------

  // Flies to a standpoint — a vantage, or an event's — and nothing else.
  const flyTo = useCallback((vantage) => {
    const engine = engineRef.current;
    if (!engine) return;
    const from = {
      position: engine.camera.position.toArray(),
      yaw: engine.yaw,
      pitch: engine.pitch,
    };
    engine.fov = defaultFovForElement(stageRef.current);
    engine.fovUser = false;
    engine.walkTarget = null;
    engine.vantageActive = true;

    // Seen from behind, a vantage is somewhere to stand rather than somewhere
    // to put the lens: the figure is set down on the standpoint facing what
    // the vantage is about, and the camera flies to the over-the-shoulder pose
    // looking the same way — resolved against the walls now, so the flight
    // ends where the rig will carry on from rather than inside a house.
    const stand = isThirdPerson(engine)
      ? stanceAt(vantage.position[0], vantage.position[2], vantage.position[1] - EYE_HEIGHT)
      : null;
    if (stand) {
      const aim = thirdPersonAim(vantage.position, vantage.lookAt);
      // A figure already hidden by a flight in progress has nothing to fade
      // out from.
      const hidden = engine.transition && engine.transition.avatar !== 'stay';
      const avatarFrom = hidden ? null : {
        x: engine.walker.x, height: engine.walker.height, z: engine.walker.z, heading: engine.heading,
      };
      // The body goes on ahead, so grabbing the view mid-flight hands back a
      // visitor who has already arrived.
      engine.walker = stand;
      engine.heading = aim.heading;
      engine.eyeY = stand.height + EYE_HEIGHT;
      engine.lastFloor = stand.height;
      const settled = engine.rig.settle(rigFrame(engine, 0, aim.yaw, aim.pitch)).toArray();
      engine.transition = {
        from,
        to: { position: settled, yaw: aim.yaw, pitch: aim.pitch },
        yawDelta: shortestAngle(from.yaw, aim.yaw),
        elapsed: 0,
        duration: 1.6,
        avatar: 'move',
        avatarFrom,
      };
      return;
    }

    const to = { position: vantage.position, ...aimFrom(vantage.position, vantage.lookAt) };
    engine.transition = {
      from,
      to,
      yawDelta: shortestAngle(from.yaw, to.yaw),
      elapsed: 0,
      duration: 1.6,
    };
  }, [stanceAt]);

  const goToVantage = useCallback((vantage) => {
    setVantageId(vantage.id);
    setPanel({ kind: 'vantage', data: vantage });
    // A vantage that looks at one of the events stages it: the room the
    // blurb describes should be the room you land in.
    if (vantage.event) setEventId(vantage.event);
    flyTo(vantage);
  }, [flyTo]);

  // An event: stage it, set the hour the text gives, and stand where it can
  // be seen. The hour stays the visitor's to change afterwards.
  const playEvent = useCallback((event) => {
    setEventId(event.id);
    if (event.hour) setTimeOfDay(event.hour);
    setVantageId(null);
    setPanel({ kind: 'event', data: event });
    flyTo(event);
  }, [flyTo]);

  // Whatever a scene link asks for: an event is played, a vantage visited, and
  // a pin opened from where it is seen, with its event staged.
  const applyLink = useCallback((target) => {
    if (!target) return;
    if (target.kind === 'event') {
      playEvent(target.target);
      return;
    }
    if (target.kind === 'vantage') {
      goToVantage(target.target);
      return;
    }
    if (target.eventId) setEventId(target.eventId);
    if (target.hour) setTimeOfDay(target.hour);
    setVantageId(scene.vantages.includes(target.standpoint) ? target.standpoint.id : null);
    setPanel({ kind: 'hotspot', data: target.target });
    if (target.standpoint) flyTo(target.standpoint);
  }, [playEvent, goToVantage, flyTo, scene]);

  // Assigned in an effect rather than during render: the render loop and the
  // tour both read these through refs, and React is right that writing one
  // mid-render is how you end up with a stale reader.
  useEffect(() => {
    goToVantageRef.current = goToVantage;
  }, [goToVantage]);

  // --- the guided walk ----------------------------------------------------
  // Reads each vantage's own blurb aloud while flying between them, so the
  // writing arrives while you are still looking at the thing it is about.

  const tourGoTo = useCallback((vantage) => {
    goToVantageRef.current?.(vantage);
  }, []);

  const tourOnStop = useCallback((tourStop) => {
    setPanel({ kind: 'vantage', data: tourStop.vantage });
  }, []);

  // Duck the ambience under the narration rather than muting it: the wind and
  // the crowd should still be there behind the voice.
  const tourOnSpeaking = useCallback((value) => {
    engineRef.current?.audio?.setVolume(value ? 0.24 : DEFAULT_SCENE_VOLUME);
  }, []);

  // The line the speaker button on the panel would read. Every vantage, event,
  // pin and barrier has a recording made at build time
  // (scripts/build-scene-narration.js); one edited since the last build falls
  // to the live-synthesis rung of the same ladder, and to silence if that is
  // unavailable.
  const panelSpeech = useMemo(() => {
    if (!panel) return null;
    const text = panel.kind === 'vantage' ? panel.data.blurb : panel.data.body;
    if (!text) return null;
    return {
      id: `${panel.kind}:${panel.data.id}`,
      text,
      audio: narrationFor(scene?.slug, panel.data.id, panel.kind)?.file || null,
    };
  }, [panel, scene]);

  const tour = useSceneTour({
    scene,
    goToVantage: tourGoTo,
    onStop: tourOnStop,
    onSpeaking: tourOnSpeaking,
    enabled: status === 'ready' && entered,
  });

  useEffect(() => {
    tourStopRef.current = tour.stop;
  }, [tour.stop]);

  // A new link while already inside — the reader, opened over the scene, sent
  // the visitor to another moment in it — flies there rather than rebuilding.
  const stopTour = tour.stop;
  useEffect(() => {
    if (!link || link === appliedLinkRef.current || !entered || status !== 'ready') return;
    appliedLinkRef.current = link;
    stopTour();
    applyLink(link);
  }, [link, entered, status, applyLink, stopTour]);

  // Reading one panel aloud while looking at another is worse than silence, so
  // moving on stops the voice — but only the voice, since a tour moves the
  // panel itself and must survive doing so.
  const speechId = panelSpeech?.id ?? null;
  const stopSpeaking = tour.stopSpeaking;
  useEffect(() => {
    stopSpeaking();
  }, [speechId, stopSpeaking]);

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
      cancelTransition(engine);
    }
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx * radius * 0.62}px, ${dy * radius * 0.62}px)`;
    }
  }, [cancelTransition]);

  // Opens Google Maps on the spot the visitor is standing, facing the way they
  // are facing. Built at click time rather than rendered as an href because the
  // camera moves every frame — and a link that opens where you *were* looking
  // misses the whole point of it.
  const openToday = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !scene?.geo) return;
    const vantage = scene.vantages.find((v) => v.id === vantageId);
    const url = sceneViewUrl(scene.geo, {
      x: engine.walker?.x ?? engine.camera.position.x,
      z: engine.walker?.z ?? engine.camera.position.z,
      yaw: engine.yaw,
      pitch: engine.pitch,
      fov: isThirdPerson(engine) ? engine.fovDefault : engine.fov,
      now: vantage?.now,
    });
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, [scene, vantageId]);

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
        <button type="button" className="scene-ghost-btn" onClick={handleExit}>
          Back to the atlas
        </button>
      </div>
    );
  }

  const currentVantage = scene.vantages.find((v) => v.id === vantageId) || scene.vantages[0];
  // The events either side of the one in the panel, in the gospels' order.
  const eventIndex = panel?.kind === 'event' ? (scene.events || []).findIndex((e) => e.id === panel.data.id) : -1;
  const eventBefore = eventIndex > 0 ? scene.events[eventIndex - 1] : null;
  const eventAfter = eventIndex >= 0 ? scene.events[eventIndex + 1] || null : null;

  // Without WebGL there is no scene to enter, but there is still a site to read
  // about — so the fallback is the same content the hotspots carry, as text.
  if (status === 'unsupported' || status === 'error') {
    return (
      <div className="scene-page scene-page--fallback">
        <button type="button" className="scene-exit" onClick={handleExit}>
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
          {link && (
            <section className="scene-fallback-section scene-fallback-section--linked">
              <p className="scene-fallback-linked-label"><ScrollText size={12} /> You came here for</p>
              <h2>{link.target.label}</h2>
              <p>{link.target.body || link.target.blurb}</p>
              <div className="scene-refs">
                {link.target.refs.map((ref) => (
                  <button key={ref} type="button" className="scene-ref" onClick={() => openScripture(ref)}>
                    <BookOpen size={13} /> {ref}
                  </button>
                ))}
              </div>
            </section>
          )}
          {(scene.events || []).length > 0 && (
            <h2 className="scene-fallback-heading">What happened here</h2>
          )}
          {[
            ...(scene.events || []).map((s) => ({ ...s, sectionKey: `event-${s.id}` })),
            ...scene.hotspots.map((s) => ({ ...s, sectionKey: `hotspot-${s.id}` })),
            ...Object.values(BARRIERS).map((s) => ({ ...s, sectionKey: `barrier-${s.id}` })),
          ].map((section) => (
            <section key={section.sectionKey} className="scene-fallback-section">
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
          <p className="scene-disclaimer scene-disclaimer--static">{disclaimer}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`scene-page${tour.touring ? ' scene-page--touring' : ''}`}>
      <div
        className="scene-stage"
        ref={stageRef}
        tabIndex={0}
        role="application"
        aria-label={stageLabel(scene.title, { third: activeView === 'third', canSwitch: canThirdPerson })}
      >
        <canvas ref={canvasRef} className="scene-canvas" />

        {status === 'ready' && entered && hotspotsFor(scene, eventId).map((hotspot) => (
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
            {link && (
              <p className="scene-intro-destination">
                <ScrollText size={13} /> {link.target.label}
                {link.target.refs?.[0] && <span className="scene-intro-destination-ref"> · {link.target.refs[0]}</span>}
              </p>
            )}
            <p className="scene-blurb">{scene.blurb}</p>
            <button
              type="button"
              className="scene-enter"
              disabled={status !== 'ready'}
              onClick={() => {
                setEntered(true);
                startAudio(muted);
                releaseOpeningShot();
                if (link && link !== openingLink) {
                  // Linked somewhere else while the card was still up.
                  appliedLinkRef.current = link;
                  applyLink(link);
                } else {
                  setPanel(link ? { kind: link.kind, data: link.target } : { kind: 'vantage', data: currentVantage });
                }
              }}
            >
              {status === 'ready' ? (
                <>
                  <Compass size={16} /> Step inside
                </>
              ) : (
                <>
                  <Loader2 size={16} className="scene-spin" /> Building {scene.title}…
                </>
              )}
            </button>
            <p className="scene-disclaimer">{disclaimer}</p>
          </div>
        </div>
      )}

      <button type="button" className="scene-exit" onClick={handleExit}>
        <X size={16} /> Exit
      </button>

      <div className="scene-actions-top-right">
        {hasAudio && entered && (
          <button
            type="button"
            className="scene-sound"
            aria-pressed={!muted}
            aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
            title={muted ? 'Sound off' : 'Sound on'}
            onClick={() => setMuted((was) => !was)}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        )}

        {entered && canThirdPerson && (
          <button
            type="button"
            className="scene-action-btn scene-action-btn--icon"
            aria-pressed={activeView === 'third'}
            aria-label={activeView === 'third' ? 'Switch to first-person view' : 'Switch to third-person view'}
            title={activeView === 'third' ? 'See through your own eyes (V)' : 'See yourself in the scene (V)'}
            onClick={toggleView}
          >
            {activeView === 'third' ? <PersonStanding size={16} /> : <ScanEye size={16} />}
          </button>
        )}

        {entered && (
          <>
            <button
              type="button"
              className="scene-action-btn scene-action-btn--icon"
              aria-pressed={quietMode}
              aria-label={quietMode ? 'Show pins & labels' : 'Quiet mode (hide pins)'}
              title={quietMode ? 'Show pins & labels' : 'Quiet mode'}
              onClick={() => setQuietMode((was) => !was)}
            >
              {quietMode ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>

            {scene.events?.length > 0 && (
              <button
                type="button"
                className="scene-action-btn"
                aria-label="What happened here"
                title="What happened here"
                onClick={() => setShowEvents(true)}
              >
                <ScrollText size={14} /> <span className="scene-action-label">Events</span>
              </button>
            )}

            <button
              type="button"
              className="scene-action-btn"
              aria-label="Places and stories"
              title="Places and stories"
              onClick={() => setShowPlaces(true)}
            >
              <List size={14} /> <span className="scene-action-label">Places</span>
            </button>

            <button
              type="button"
              className="scene-action-btn"
              aria-label="Historical sources and certainty"
              title="How we know"
              onClick={() => setShowSources(true)}
            >
              <HelpCircle size={14} /> <span className="scene-action-label">How we know</span>
            </button>

            <button
              type="button"
              className="scene-action-btn scene-action-btn--icon"
              aria-pressed={showSettings}
              aria-label="Scene settings"
              title="Settings"
              onClick={() => setShowSettings((was) => !was)}
            >
              <Sliders size={15} />
            </button>
          </>
        )}
      </div>

      {showSettings && entered && (
        <div className="scene-settings-popover" role="dialog" aria-label="Scene Settings">
          <div className="scene-settings-row">
            <span className="scene-settings-label">Walk Pace</span>
            <div className="scene-settings-options">
              <button
                type="button"
                className={`scene-settings-opt-btn${!fastWalk ? ' scene-settings-opt-btn--active' : ''}`}
                onClick={() => setFastWalk(false)}
              >
                Natural (1.6 m/s)
              </button>
              <button
                type="button"
                className={`scene-settings-opt-btn${fastWalk ? ' scene-settings-opt-btn--active' : ''}`}
                onClick={() => setFastWalk(true)}
              >
                Brisk (3.6 m/s)
              </button>
            </div>
          </div>

          <div className="scene-settings-row">
            <span className="scene-settings-label">Graphics Quality</span>
            <div className="scene-settings-options">
              {['auto', 'low', 'balanced', 'high'].map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`scene-settings-opt-btn${userQuality === q ? ' scene-settings-opt-btn--active' : ''}`}
                  onClick={() => handleQualityChange(q)}
                >
                  {q.charAt(0).toUpperCase() + q.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {entered && (
        <>
          {/* Keyed on the view so switching remounts it, which replays the
              fade in Scene.css: the new view's controls get their ten
              seconds on screen too. */}
          <p className="scene-hint" aria-hidden="true" key={activeView}>
            {controlsHint({ third: activeView === 'third', coarse, canSwitch: canThirdPerson })}
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

          {/* The hour of the day. A segmented control rather than a slider:
              these are five researched lightings, not a continuum, and each
              one is a claim about what the place looked like then. */}
          <div className="scene-hours" role="group" aria-label="Time of day">
            {TIMES_OF_DAY.map((time) => (
              <button
                key={time.id}
                type="button"
                className={`scene-hour${time.id === timeOfDay ? ' active' : ''}`}
                aria-pressed={time.id === timeOfDay}
                onClick={() => setTimeOfDay(time.id)}
              >
                {time.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`scene-tour${tour.touring ? ' active' : ''}`}
            aria-pressed={tour.touring}
            onClick={() => {
              if (tour.touring) {
                tour.stop();
                return;
              }
              // Everything the visitor opened to get here is chrome once the
              // walk starts; the rails and popovers stand down in Scene.css,
              // and the caption starts open because the words are the point.
              setShowSettings(false);
              setPanelCollapsed(false);
              tour.start();
            }}
          >
            {tour.touring
              ? <><Square size={13} /> Stop the walk</>
              : <><Footprints size={14} /> Walk with me</>}
          </button>

          <div className="scene-vantages" role="group" aria-label="Where to stand">
            {scene.vantages.map((vantage) => (
              <button
                key={vantage.id}
                type="button"
                className={`scene-vantage${vantage.id === vantageId ? ' active' : ''}`}
                aria-pressed={vantage.id === vantageId}
                onClick={() => { tour.stop(); goToVantage(vantage); }}
              >
                {vantage.label}
              </button>
            ))}
          </div>

          {panel && (
            <aside
              // The global Scripture/Wiki linkers replace text nodes inside
              // captions. Replace the caption as a unit when its story changes
              // so React never reconciles text nodes those linkers have removed.
              key={`${panel.kind}:${panel.data.id}`}
              className={
                `scene-panel${tour.touring ? ' scene-panel--caption' : ''}`
                + `${panelCollapsed ? ' scene-panel--collapsed' : ''}`
              }
            >
              <div className="scene-panel-controls">
                {/* Read this to me. The guided walk is the same voice reading
                    the same lines, so during one this would be a second mouth
                    on the same sentence — it is the walk's job then. */}
                {panelSpeech && !tour.touring && (
                  <button
                    type="button"
                    className="scene-panel-btn scene-panel-btn--speak"
                    aria-pressed={tour.speakingId === panelSpeech.id}
                    aria-label={tour.speakingId === panelSpeech.id ? 'Stop reading' : 'Read this aloud'}
                    title={tour.speakingId === panelSpeech.id ? 'Stop reading' : 'Read this aloud'}
                    onClick={() => tour.speak(panelSpeech)}
                  >
                    {tour.speakingId === panelSpeech.id
                      ? <Square size={12} />
                      : <Speech size={15} />}
                  </button>
                )}
                <button
                  type="button"
                  className="scene-panel-btn"
                  aria-expanded={!panelCollapsed}
                  aria-label={panelCollapsed ? 'Show the description' : 'Collapse the description'}
                  title={panelCollapsed ? 'Show the description' : 'Collapse the description'}
                  onClick={() => setPanelCollapsed((was) => !was)}
                >
                  {panelCollapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {/* No close during the walk: the next stop would only open it
                    again, so collapsing is the honest control to offer. */}
                {!tour.touring && (
                  <button
                    type="button"
                    className="scene-panel-btn"
                    aria-label="Close"
                    onClick={() => setPanel(null)}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
              {/* Collapsed, the whole card is the way back in — a title line is
                  a small target for a thumb, and nothing else in it is
                  interactive while it is folded. */}
              {panelCollapsed && (
                <button
                  type="button"
                  className="scene-panel-expand"
                  aria-label="Show the description"
                  onClick={() => setPanelCollapsed(false)}
                >
                  <span className="scene-panel-peek">
                    <ChevronDown size={11} /> Tap to read
                  </span>
                </button>
              )}
              <p className="scene-eyebrow">
                {panel.kind === 'vantage' && <><Compass size={12} /> You are standing at</>}
                {panel.kind === 'hotspot' && <><Info size={12} /> Look closer</>}
                {panel.kind === 'barrier' && <><Hand size={12} /> You can go no further</>}
                {panel.kind === 'event' && <><ScrollText size={12} /> {panel.data.place || 'What happened here'}</>}
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
              {panel.kind === 'event' && (eventBefore || eventAfter) && (
                <div className="scene-event-steps">
                  {eventBefore && (
                    <button
                      type="button"
                      className="scene-event-step"
                      aria-label={`Before this: ${eventBefore.label}`}
                      onClick={() => { tour.stop(); playEvent(eventBefore); }}
                    >
                      <ChevronLeft size={14} />
                      <span className="scene-event-step-label">{eventBefore.label}</span>
                    </button>
                  )}
                  {eventAfter && (
                    <button
                      type="button"
                      className="scene-event-step scene-event-step--next"
                      aria-label={`Next: ${eventAfter.label}`}
                      onClick={() => { tour.stop(); playEvent(eventAfter); }}
                    >
                      <span className="scene-event-step-label">{eventAfter.label}</span>
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              )}
              {scene.geo && (
                <button type="button" className="scene-now" onClick={openToday}>
                  <Satellite size={13} /> See this spot today
                  <span className="scene-now-note">opens Google Maps</span>
                </button>
              )}
            </aside>
          )}
        </>
      )}

      {showPlaces && (
        <ScenePlacesModal
          scene={scene}
          onSelectVantage={(v) => {
            tour.stop();
            goToVantage(v);
            setShowPlaces(false);
          }}
          onSelectHotspot={(h) => {
            const events = [].concat(h.event || []);
            if (events.length && !events.includes(eventId)) setEventId(events[0]);
            setPanel({ kind: 'hotspot', data: h });
            setShowPlaces(false);
          }}
          onClose={() => setShowPlaces(false)}
        />
      )}

      {showEvents && (
        <SceneEventsModal
          scene={scene}
          activeId={eventId}
          onSelect={(event) => {
            tour.stop();
            setShowEvents(false);
            playEvent(event);
          }}
          onClose={() => setShowEvents(false)}
        />
      )}

      {showSources && (
        <SceneSourcesModal
          sceneSlug={scene.slug}
          onClose={() => setShowSources(false)}
        />
      )}
    </div>
  );
}
