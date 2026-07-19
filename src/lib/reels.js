// Character Reels roster: which wiki people get a card in the /reels feed,
// and in what order. Core entries arrive weight-ranked from the asset, so
// prominence order is free; characters with a looping animation jump to the
// front (they're the showpiece), and an animated character outside the top
// slice still earns a card — every clip added to wiki-animations.json appears
// in the feed automatically.
import { NO_GENERATED_IMAGE, formatYearRange } from './bibleWiki';

export const REELS_LIMIT = 40;

export function buildReelsRoster(entries, animations = {}, limit = REELS_LIMIT) {
  const people = (entries || []).filter(
    (e) => e.type === 'person' && e.desc && !NO_GENERATED_IMAGE.has(e.s),
  );
  const top = people.slice(0, limit);
  const animated = people.filter((e) => animations[e.s]);
  const stills = top.filter((e) => !animations[e.s]);
  return [...animated, ...stills].map((e) => ({
    slug: e.s,
    name: e.name,
    desc: e.desc,
    era: formatYearRange(e.y),
    keyVerse: e.kv?.[0] || null,
    animHash: animations[e.s] || null,
  }));
}
