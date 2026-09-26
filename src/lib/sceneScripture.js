// From a passage to the places it happened: which parts of the walkable 3D
// scenes (src/lib/scenes.js) a piece of scripture is about.
//
// Every event, vantage and pin in a scene manifest carries the references it
// is about. This turns those into verse coverage once, and answers "what in
// the scenes overlaps this passage?" for the scripture reader, which offers
// the answers as links straight into the scene (sceneLinkPath) — reading
// Mark 1:29-31 offers the house at Capernaum with Peter's mother-in-law being
// lifted off her mat; reading Exodus 26 offers the Tabernacle's curtains.
//
// Lazy-loaded by the reader: the manifests are text, but there are five of
// them and the reader needs them only once a passage is showing.

import { SCENES, sceneLinkPath } from './scenes';
import { refToPassageIds } from './scripture';

// The verses and whole chapters a list of passage ids ('MRK.1.29-MRK.1.31',
// 'MRK.1', 'LUK.4.31-LUK.5.11') covers. A range that crosses chapters counts
// its chapters whole; the scenes never need finer than that across a break.
function coverage(passageIds) {
  const verses = new Set();
  const chapters = new Set();
  for (const id of passageIds) {
    const [startId, endId] = String(id).split('-');
    const start = startId.split('.');
    if (start.length === 2) {
      chapters.add(startId);
      continue;
    }
    if (start.length !== 3) continue;
    const end = endId ? endId.split('.') : start;
    if (end[0] !== start[0]) continue;
    if (end[1] !== start[1]) {
      for (let chapter = Number(start[1]); chapter <= Number(end[1]); chapter += 1) chapters.add(`${start[0]}.${chapter}`);
      continue;
    }
    const from = Number(start[2]);
    const to = Number(end[2] ?? start[2]);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) continue;
    for (let verse = from; verse <= Math.min(to, from + 400); verse += 1) verses.add(`${start[0]}.${start[1]}.${verse}`);
  }
  return { verses, chapters };
}

const chapterOf = (verseId) => verseId.slice(0, verseId.lastIndexOf('.'));

// How much two coverages share, in verses; a whole chapter against a verse in
// it counts as that verse. Zero means they do not touch.
function overlap(a, b) {
  let shared = 0;
  for (const verse of a.verses) {
    if (b.verses.has(verse) || b.chapters.has(chapterOf(verse))) shared += 1;
  }
  for (const verse of b.verses) {
    if (!a.verses.has(verse) && a.chapters.has(chapterOf(verse))) shared += 1;
  }
  for (const chapter of a.chapters) if (b.chapters.has(chapter)) shared += 1;
  return shared;
}

const KIND_ORDER = { event: 0, vantage: 1, hotspot: 2 };

let index = null;
// Every event, vantage and pin of every scene, with its references' coverage.
function sceneIndex() {
  if (index) return index;
  index = [];
  for (const scene of SCENES) {
    const add = (kind, item, text, order) => {
      const refs = (item.refs || []).map((ref) => ({ ref, covers: coverage(refToPassageIds(ref)) }))
        .filter(({ covers }) => covers.verses.size || covers.chapters.size);
      if (!refs.length) return;
      index.push({
        scene, kind, item, text, order, refs,
      });
    };
    (scene.events || []).forEach((event, i) => add('event', event, event.body, i));
    scene.vantages.forEach((vantage, i) => add('vantage', vantage, vantage.blurb, i));
    // A pin on the skyline is about a mountain, not a passage you could stand in.
    scene.hotspots.filter((hotspot) => !hotspot.landmark).forEach((hotspot, i) => add('hotspot', hotspot, hotspot.body, i));
  }
  return index;
}

// The parts of the scenes a passage is about, best first: events before
// vantages before pins, the closest fit first within each, and nothing twice.
// Each comes with the reference that matched and a link into the scene.
export function sceneMomentsForPassage(passageIds, { limit = 12 } = {}) {
  const passage = coverage(passageIds || []);
  if (!passage.verses.size && !passage.chapters.size) return [];
  const found = [];
  for (const entry of sceneIndex()) {
    let best = null;
    for (const ref of entry.refs) {
      const shared = overlap(passage, ref.covers);
      if (!shared) continue;
      // Of the references that touch the passage, the one most about it: the
      // most shared, then the narrowest.
      const width = ref.covers.verses.size + ref.covers.chapters.size * 40;
      if (!best || shared > best.shared || (shared === best.shared && width < best.width)) {
        best = { ref: ref.ref, shared, width };
      }
    }
    if (best) found.push({ ...entry, match: best });
  }
  found.sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    || (b.match.shared / b.match.width) - (a.match.shared / a.match.width)
    || SCENES.indexOf(a.scene) - SCENES.indexOf(b.scene)
    || a.order - b.order);

  const moments = [];
  for (const entry of found) {
    // A vantage or pin that belongs to an event is reached through it: if its
    // event is offered it is that event, and if not, following it would stage
    // a different moment from the one being read.
    if (entry.kind !== 'event' && entry.item.event) continue;
    moments.push({
      slug: entry.scene.slug,
      sceneTitle: entry.scene.title,
      kind: entry.kind,
      id: entry.item.id,
      label: entry.item.label,
      place: entry.item.place || null,
      ref: entry.match.ref,
      path: sceneLinkPath(entry.scene, entry.kind, entry.item.id),
    });
    if (moments.length >= limit) break;
  }
  return moments;
}
