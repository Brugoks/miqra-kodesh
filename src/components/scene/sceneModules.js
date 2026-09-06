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

import * as templeNavigation from './templeNavigation';
import * as caesareaNavigation from './caesareaNavigation';
import * as capernaumNavigation from './capernaumNavigation';

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
  },
};

export function sceneModule(slug) {
  return MODULES[slug] || null;
}

export function knownSceneSlugs() {
  return Object.keys(MODULES);
}
