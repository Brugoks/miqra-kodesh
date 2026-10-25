// Which code belongs to which scene.
//
// Scene.jsx used to pick a navigation module and a builder with a pair of
// ternaries keyed on the slug. That works for two scenes and becomes a place to
// forget something at three, so the mapping lives here instead and the route
// stays generic: adding a site means adding one row.
//
// Navigation is imported eagerly — it is a few kilobytes of arithmetic, and the
// route needs `stanceAt` before the first frame in order to know where the
// visitor is standing. Builders are dynamic, because they are the part that
// pulls in geometry, and only one of them is ever wanted.
//
// `travelSpeed` is the pace the visitor gets from the fast-walk toggle (see
// sceneGaits.js), in metres per second. It is for covering ground, so it is set
// by how big the place is — roughly the speed at which its long way across takes
// two minutes — and left out (a default of 5.5) where the whole place can be
// seen from the middle. In the third-person view it is capped at the figure's
// jog, whatever it says here.
//
// `defaultPace` is the pace a first-time visitor starts on, unless they have
// chosen one of their own: 'brisk' where the place is big enough that a stroll
// is a chore, which is the same places that ask for a `travelSpeed`. Left out
// (the stroll) where the whole place can be taken in from the middle.
//
// `thirdPerson` opts a scene into the over-the-shoulder view (see
// sceneThirdPerson.js), and `defaultView` says which one it opens in. Opt-in
// rather than universal because the view needs a scene built for a body to be
// seen in — a camera collider set, floors the figure's feet actually meet —
// and a scene that has not been checked for that is better seen through the
// visitor's own eyes. Every other row stays first-person with no toggle.

import * as templeNavigation from './templeNavigation';
import * as caesareaNavigation from './caesareaNavigation';
import * as capernaumNavigation from './capernaumNavigation';
import * as tabernacleNavigation from './tabernacleNavigation';
import * as elahNavigation from './elahNavigation';
import * as olivetNavigation from './olivetNavigation';
import * as bethlehemNavigation from './bethlehemNavigation';
import * as sinaiNavigation from './sinaiNavigation';
import * as nehemiahNavigation from './nehemiahNavigation';
import * as jerusalemNavigation from './jerusalemNavigation';
import { travelSpeedOf, isPace, DEFAULT_PACE } from './sceneGaits';

const MODULES = {
  sinai: {
    navigation: sinaiNavigation,
    loadBuilder: () => import('./buildSinai'),
    // 300 by 340 m, up a mountain.
    travelSpeed: 6,
    defaultPace: 'brisk',
    thirdPerson: true,
    defaultView: 'third',
  },
  bethlehem: {
    navigation: bethlehemNavigation,
    loadBuilder: () => import('./buildBethlehem'),
    thirdPerson: true,
    defaultView: 'third',
  },
  'second-temple': {
    navigation: templeNavigation,
    loadBuilder: () => import('./buildSecondTemple'),
  },
  caesarea: {
    navigation: caesareaNavigation,
    loadBuilder: () => import('./buildCaesarea'),
  },
  capernaum: {
    navigation: capernaumNavigation,
    loadBuilder: () => import('./buildCapernaum'),
    // A village sized to a body — a doorway you stoop through, a lane two
    // people wide, a roof you climb onto — so it opens seen from behind one.
    thirdPerson: true,
    defaultView: 'third',
  },
  tabernacle: {
    navigation: tabernacleNavigation,
    loadBuilder: () => import('./buildTabernacle'),
  },
  'valley-of-elah': {
    navigation: elahNavigation,
    loadBuilder: () => import('./buildElah'),
  },
  'mount-of-olives': {
    navigation: olivetNavigation,
    loadBuilder: () => import('./buildOlivet'),
    // 780 by 740 m of hillside.
    travelSpeed: 7,
    defaultPace: 'brisk',
    thirdPerson: true,
    defaultView: 'third',
  },
  // A walled city on a ridge, seen at the wall's own height: the walkway along
  // the top is reached by stairs, and the view from it is the point, so it
  // opens through the visitor's own eyes. Not opted into the third-person view:
  // the figure's follow camera has no collider set for a walkway two metres
  // wide.
  'nehemiahs-wall': {
    navigation: nehemiahNavigation,
    loadBuilder: () => import('./buildNehemiah'),
    // 924 by 1356 m, and a circuit of two and a half kilometres: at a stroll the
    // wall alone is half an hour's walk.
    travelSpeed: 8,
    defaultPace: 'brisk',
  },
  jerusalem: {
    navigation: jerusalemNavigation,
    loadBuilder: () => import('./buildJerusalem'),
    travelSpeed: 6.5,
    defaultPace: 'brisk',
  },
};

export function sceneModule(slug) {
  return MODULES[slug] || null;
}

// What the fast walk gives in a scene (sceneGaits.js), by slug: a number out of
// the row rather than the row itself, which is how the route asks.
export function travelSpeedFor(slug) {
  return travelSpeedOf(MODULES[slug]?.travelSpeed);
}

// The pace a scene opens on for someone who has not chosen one.
export function defaultPaceFor(slug) {
  const asked = MODULES[slug]?.defaultPace;
  return isPace(asked) ? asked : DEFAULT_PACE;
}

export function knownSceneSlugs() {
  return Object.keys(MODULES);
}
