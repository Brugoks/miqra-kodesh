import { CAESAREA } from './caesareaScene';
import { CAPERNAUM } from './capernaumScene';
import { TABERNACLE } from './tabernacleScene';

// Registry for the immersive "step inside" scenes at /scene/:slug — a small
// first-person 3D reconstruction of a biblical site, reached from the Atlas
// detail sheet and the wiki entry for the same place.
//
// This module is deliberately free of React and three.js: everything the app
// needs in order to decide *whether* a place has a scene, what to call it, and
// what to say about it lives here as plain data, so the atlas can link to a
// scene without pulling the 3D chunk into its bundle. The geometry that
// consumes these coordinates lives in components/scene/buildSecondTemple.js.
//
// World axes shared by the manifest and the builder (metres, 1 cubit = 0.5m):
//   -Z  west, toward the sanctuary and the Holy of Holies
//   +Z  east, toward the gates and the Mount of Olives
//   +X  north        -X  south        +Y  up
// The Temple faced east, so a worshipper always looks down -Z — which is also
// three.js's default camera direction, so a vantage with yaw 0 needs no
// special-casing.
//
// Every Y below is an absolute height, not a height above the floor, because
// the precinct climbs westward in three steps: the outer court paving at 0,
// the Court of the Women at 3.2 (up twelve steps), and the inner court at 6.95
// (up the fifteen). A standing eye is its floor plus about 1.7. Those three
// numbers are `LEVEL` in components/scene/buildSecondTemple.js — change them
// there and the vantages here have to move with them.

// Everything below is a reconstruction, not a photograph. The proportions come
// from Mishnah Middot and Josephus (Antiquities 15, War 5); the surface detail
// is informed guesswork. The UI says so on screen.
export const SCENE_DISCLAIMER =
  'An artist’s reconstruction, not a photograph. Proportions follow Mishnah Middot '
  + 'and Josephus; colours, crowds and surface detail are informed guesswork.';

const SECOND_TEMPLE = {
  slug: 'second-temple',
  // The atlas/wiki place this scene belongs to. One place has at most one scene
  // today; `sceneForPlace` returns that one, so if a place ever gains a second
  // era the caller will need a picker rather than a single button.
  placeSlug: 'jerusalem',
  title: 'Herod’s Temple',
  subtitle: 'Jerusalem · c. AD 30',
  blurb:
    'The temple Herod rebuilt stood on a platform larger than any sanctuary in the Roman '
    + 'world — thirty-five acres of paving, colonnades and courts, climbing westward through '
    + 'gate after gate to a facade of white stone and gold. This is where Jesus taught, where '
    + 'a widow gave her two coins, and where the disciples stopped to admire the stonework days '
    + 'before he told them none of it would be left standing.',
  // Where the scene's origin sits on earth, and how its axes lie against the
  // compass: `bearing` is what the camera faces at yaw 0 (down -Z, at the
  // sanctuary, due west), `xAxis` is the heading of +X (north). Both are
  // needed — see src/lib/googleMaps.js — because the scenes disagree about
  // which way round their axes go.
  geo: { lat: 31.778, lon: 35.2354, bearing: 270, xAxis: 0 },
  // Where the camera starts. Must match one of the vantage ids below.
  defaultVantage: 'solomons-portico',

  vantages: [
    {
      id: 'solomons-portico',
      label: 'Solomon’s Portico',
      // [x, y, z] eye position, and the point the camera looks at.
      position: [0, 1.75, 222],
      lookAt: [0, 30, -6],
      blurb:
        'The eastern colonnade of the outer court, open to anyone — Jew or Gentile, pilgrim or '
        + 'trader. Jesus walked here in winter; the apostles gathered here after Pentecost. From '
        + 'the shade of its columns the whole ascent to the sanctuary is in view.',
      refs: ['John 10:23', 'Acts 3:11', 'Acts 5:12'],
    },
    {
      id: 'the-soreg',
      label: 'The Dividing Wall',
      position: [0, 1.75, 126],
      lookAt: [0, 20, -6],
      blurb:
        'A waist-high stone screen ran around the inner courts carrying notices in Greek and '
        + 'Latin: no foreigner beyond this point, on pain of death. Two of those stones have been '
        + 'dug up. Paul, nearly lynched over a rumour that he had led a Greek past it, later '
        + 'called it the wall of hostility Christ tore down.',
      refs: ['Ephesians 2:14', 'Acts 21:28'],
    },
    {
      id: 'court-of-women',
      label: 'The Court of the Women',
      position: [0, 4.9, 88],
      lookAt: [0, 26, -6],
      blurb:
        'The great public court, 135 cubits square, and as far in as most worshippers ever came. '
        + 'Thirteen trumpet-mouthed chests along its walls took the offerings. Simeon and Anna '
        + 'waited here for the consolation of Israel; a widow put in two small coins and was '
        + 'noticed by the only person counting.',
      refs: ['Mark 12:41-44', 'Luke 2:36-38', 'John 8:20'],
    },
    {
      id: 'fifteen-steps',
      label: 'The Fifteen Steps',
      position: [0, 6.9, 32],
      lookAt: [0, 20, -6],
      blurb:
        'Fifteen semicircular steps climbed from the women’s court to the Nicanor Gate — one, '
        + 'the rabbis said, for each of the Songs of Ascents. At the Feast of Tabernacles the '
        + 'Levites stood on them with harps and cymbals and sang through the night.',
      refs: ['Psalm 120:1', 'Psalm 134:1'],
    },
    {
      id: 'before-the-altar',
      label: 'Before the Altar',
      position: [6, 8.65, 23],
      lookAt: [-1, 14, -4],
      blurb:
        'Past the gate, in the narrow Court of Israel, laymen stood at the rail while the priests '
        + 'worked. The altar burned without pause; the smoke of the morning and evening lamb was '
        + 'the clock the whole city lived by. Zechariah drew the lot to burn incense inside, and '
        + 'the crowd waited out here for a blessing he came back unable to speak.',
      refs: ['Luke 1:8-11', 'Leviticus 6:12-13'],
    },
  ],

  // Anchored labels floating in the world. `position` is the point projected to
  // screen each frame; `maxDistance` hides a label once the camera is far enough
  // away that it would only be clutter over the skyline.
  hotspots: [
    {
      id: 'sanctuary',
      label: 'The Sanctuary',
      position: [0, 38, -8],
      maxDistance: 300,
      body:
        'The porch stood a hundred cubits high and a hundred wide — about fifty metres each way '
        + '— faced in white stone and plated with gold that, Josephus says, forced you to look '
        + 'away in the morning sun. Behind its doorway lay the Holy Place, and behind that the '
        + 'empty, curtained room no one entered but the high priest, once a year.',
      refs: ['Mark 13:1-2', 'Hebrews 9:6-7'],
    },
    {
      id: 'altar',
      label: 'The Altar of Burnt Offering',
      position: [0, 16, 9],
      maxDistance: 150,
      body:
        'Unhewn stone, thirty-two cubits square at the base, with a ramp on the south because the '
        + 'law forbade steps up to an altar. A lamb went up at dawn and another at dusk, every day, '
        + 'for centuries. The fire was never allowed to go out.',
      refs: ['Exodus 20:25-26', 'Numbers 28:3-4'],
    },
    {
      id: 'nicanor-gate',
      label: 'The Nicanor Gate',
      position: [0, 20, 26.5],
      maxDistance: 170,
      body:
        'Corinthian bronze, and by every account the most beautiful of the gates — heavy enough '
        + 'that closing it was said to be heard across the city. Tradition identifies it with the '
        + 'Beautiful Gate where Peter and John met the man lame from birth.',
      refs: ['Acts 3:1-8'],
    },
    {
      id: 'treasury',
      label: 'The Treasury',
      position: [-31, 7, 62],
      maxDistance: 130,
      body:
        'Thirteen chests with trumpet-shaped mouths stood against the wall of the women’s court, '
        + 'each labelled for a different offering. Metal on metal in a stone room is loud: a rich '
        + 'gift announced itself. Two copper coins did not.',
      refs: ['Mark 12:41-44', 'John 8:20'],
    },
    {
      id: 'soreg',
      label: 'The Soreg',
      position: [20, 3.2, 118],
      maxDistance: 160,
      body:
        'The low screen marking the boundary Gentiles could not cross — waist high, and utterly '
        + 'binding. Warning stones in Greek and Latin stood along it at intervals, and two of them '
        + 'have been dug up. Walk down to it and it will turn you back, which is rather the point.',
      refs: ['Ephesians 2:13-14'],
    },
    {
      id: 'portico',
      label: 'The Porticoes',
      position: [-60, 14, 224],
      maxDistance: 260,
      body:
        'Double and triple rows of columns ran round the whole platform, deep enough to hold a '
        + 'crowd out of the sun. Teachers taught here, money was changed here, and doves were sold '
        + 'here for the offerings of the poor — until the morning Jesus turned the tables over.',
      refs: ['Mark 11:15-17', 'Luke 2:46'],
    },
    {
      id: 'olivet',
      label: 'The Mount of Olives',
      position: [0, 40, 640],
      maxDistance: 900,
      body:
        'Across the Kidron valley, close enough that the whole temple platform lies open in front '
        + 'of you. Sitting on this slope looking back at the gold and the stonework, Jesus told '
        + 'four of his disciples that not one stone would be left on another.',
      refs: ['Mark 13:3-4', 'Luke 19:41-44'],
    },
  ],
};

const SCENES = [SECOND_TEMPLE, CAESAREA, CAPERNAUM, TABERNACLE];

const BY_SLUG = new Map(SCENES.map((scene) => [scene.slug, scene]));
const BY_PLACE = new Map(SCENES.map((scene) => [scene.placeSlug, scene]));

// The scene whose own slug this is (`second-temple`), or null.
export function getScene(slug) {
  return BY_SLUG.get(slug) || null;
}

// The scene standing on this atlas/wiki place (`jerusalem`), or null.
export function sceneForPlace(placeSlug) {
  return BY_PLACE.get(placeSlug) || null;
}

// Used by the atlas sheet and the wiki entry to decide whether to offer the
// "Step inside" button at all.
export function hasScene(placeSlug) {
  return BY_PLACE.has(placeSlug);
}

// /scene/:slug accepts either identifier, so a link can be built from whichever
// slug the caller happens to be holding — the place slug in the atlas, the
// scene slug in a direct link — without the caller needing to know which.
export function resolveScene(slug) {
  if (!slug) return null;
  return getScene(slug) || sceneForPlace(slug);
}

export function vantageById(scene, id) {
  if (!scene) return null;
  return scene.vantages.find((v) => v.id === id) || null;
}

// The vantage a scene opens on. Falls back to the first one so a manifest with
// a stale `defaultVantage` still opens somewhere sensible rather than nowhere.
export function defaultVantage(scene) {
  if (!scene) return null;
  return vantageById(scene, scene.defaultVantage) || scene.vantages[0] || null;
}

export function scenePath(scene) {
  return scene ? `/scene/${scene.slug}` : null;
}

export { SCENES };
