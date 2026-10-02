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

const MODULES = {
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
    thirdPerson: true,
    defaultView: 'third',
  },
};

export function sceneModule(slug) {
  return MODULES[slug] || null;
}

export function knownSceneSlugs() {
  return Object.keys(MODULES);
}
