# Ancient World Atlas — Enhancements Plan

**Feature set:** Six independent enhancements to the shipped `/atlas` route, ordered by
value-per-effort. Each phase ships on its own; none blocks another. See
[docs/ancient-atlas-plan.md](./ancient-atlas-plan.md) for the original build and the
conventions everything here inherits.

**Framing (do not drift from this):** the atlas is a *reading aid*, not a history engine.
Every addition here either (a) makes what's already on the map easier to read, or (b) ties
the map back to Scripture's own text. Nothing here adjudicates contested history; where a
number is an approximation, the UI says so.

**Build order:** Phases 1 and 2 are hours of work and worth doing first. Phase 3 is the one
worth real investment. Phases 4-6 are optional and independently valuable.

---

## Measured facts this plan rests on

Verified against the live repo and live services on 2026-09-03. Re-verify before assuming
they still hold.

| Fact | Value | Consequence |
|---|---|---|
| Atlas places mapping to a wiki entry | **150 of 1,252** | …but **150 of the 163** visible at zoom ≤7 |
| Generated place images live at R2 | `https://wiki-images.miqra-kodesh.com/_default/<slug>.jpg` — 12/12 sampled returned **HTTP 200** | Phase 1 is essentially free |
| Thumbnail variant | `_default/thumbs/<slug>.jpg`, 128×128, ~4KB | Use this in the sheet, not the full image |
| Elevation API | `api.opentopodata.org/v1/srtm90m` — free, no key, **100 locations/request**, 1 req/sec | 1,252 places = **13 requests** |
| Elevation spot-check | Jerusalem **744m**, Jericho **−233m**, Dead Sea **−415m**, Tyre **2m** | Matches known values; data is trustworthy |
| Jerusalem → Jericho drop | **977m ≈ 3,200 ft** over ~17mi | The Good Samaritan road, quantified |
| Atlas asset chapter arrays | **Absent** — `build-atlas.js` strips `p` to keep the payload lean | Phase 5 must get chapters elsewhere |
| `bible-places.json` | 99.6KB, **already a shared build chunk** (PassageMap loads it) | Reuse it — costs 0 new bytes vs. 62.8KB for a new index |
| People with ≥5 placed events | **20** (minus God + Holy Spirit = **18 usable**) | Phase 6's realistic scope |
| Top traceable figures | Jesus 70, Paul 30, Peter 27, Jacob 11, Abraham 11, Luke 11, Moses 8 | Phase 6 ships for these, not universally |

---

## Phase 1 — Place imagery in the detail sheet (ships alone, ~2h)

`AtlasDetailSheet` is text-only today. Every prominent place already has generated art sitting
in R2, and the place-image prompts were just corrected to be landscape-focused rather than
person-focused (commit `23bec2f`) — which is exactly what an atlas wants.

**Do:** in `AtlasDetailSheet.jsx`, for `selection.kind === 'place'` (and for an event's resolved
place), render the thumbnail above the title.

```js
import { wikiImageUrl } from '../../lib/wikiImageUrls';
const thumb = place.w ? wikiImageUrl(`_default/thumbs/${place.s}.jpg`) : null;
```

**Rules:**
- Only attempt a URL when `place.w === true`. The 1,102 map-only places have no wiki entry and
  no image; they must degrade to today's text-only sheet with no broken-image frame.
- Handle load failure with `onError` → hide the `<img>`. R2 coverage is high but not total.
- Fixed aspect box (e.g. `aspect-ratio: 16/10; object-fit: cover`) so the sheet doesn't jump
  height between a place with art and one without.
- `loading="lazy"`, and `alt={place.n}`.

**Verify:** tap Jerusalem, Babylon, Jericho, Sinai (all confirmed present) and any `map-*`
slug (confirmed absent) to see both paths.

---

## Phase 2 — Play the eras (ships alone, ~2h)

A play button on the scrubber that auto-advances `year`, so the user can watch four millennia
of empires wash over the same land instead of dragging manually. All the parts exist.

**Do:** add `playing` state in `Atlas.jsx`, a transport button in `AtlasScrubber.jsx`, and a
timer that steps `year` forward. Step size should come from the current era's `window` (the
Gospels advance ~1yr/tick, Primeval ~50) so dense eras don't blur past.

**The gotcha that will bite you:** `react-hooks/set-state-in-effect` is enforced as an ERROR in
this repo, and it already bit the journey playback. Do NOT write
`if (year >= END) setPlaying(false)` inside the advance effect. Use the derived-state pattern
already in `Atlas.jsx`:

```js
const atEnd = year >= atlas.eras[atlas.eras.length - 1].to;
const isPlaying = playing && !atEnd;          // derived, not stored
const handleTogglePlay = () => {              // restart from the top if parked at the end
  if (atEnd) { setYear(atlas.eras[0].from); setPlaying(true); } else setPlaying((v) => !v);
};
useEffect(() => {
  if (!isPlaying) return undefined;
  const t = setTimeout(() => setYear((y) => y + stepFor(era)), TICK_MS);
  return () => clearTimeout(t);
}, [isPlaying, year, era]);
```

Pair it with the Territories layer on and it becomes the demo reel for the whole feature.
Respect `prefers-reduced-motion` by making the tick slower rather than disabling it outright.

---

## Phase 3 — Elevation: "went up to Jerusalem" (the investment, ~1 day)

Scripture's travel vocabulary is relentlessly vertical — you go *up* to Jerusalem, *down* to
Egypt, *down* to Jericho. That is topography, not idiom, and no Bible app surfaces it well.

### 3a. Build script — `scripts/build-atlas-elevation.js`

Fetches an elevation per place once and bakes it into the asset. **Never call the API at
runtime.**

```
node scripts/build-atlas-elevation.js            # fills in missing elevations
node scripts/build-atlas-elevation.js --check    # CI drift check
```

- Endpoint: `https://api.opentopodata.org/v1/srtm90m?locations=<lat>,<lon>|...`
- **100 locations per request** (101 returns `INVALID_REQUEST`), so batch in chunks of 100 →
  13 requests for all 1,252 places. Sleep ≥1s between requests (public rate limit).
- Write results to `src/assets/atlas-elevation.json` as a flat `{ "<slug>": <metres> }` map —
  keep it separate from `bible-atlas.json` so a failed/partial elevation run can never corrupt
  the main asset, and so `build-atlas.js` stays deterministic and offline.
- Resumable: skip slugs already present, so a rate-limit failure can be re-run.
- SRTM has no data over open water and returns `null` — store `null` explicitly rather than
  omitting, so the script doesn't retry known-null points forever.
- Round to whole metres. Sort keys for a stable diff.

### 3b. Pure helpers — `src/lib/atlas.js`

```js
export function elevationFor(elevations, slug)        // metres | null
export function elevationDelta(elevations, a, b)      // { from, to, delta } | null
export function describeVertical(delta)               // 'a climb of 977 m (3,205 ft)' | 'a descent of…' | 'roughly level'
```

`describeVertical` is where the teaching happens — it should read in the Bible's own direction
language ("up"/"down"), and treat anything under ~75m as level rather than implying precision
the 90m-resolution dataset doesn't have.

### 3c. UI

- **Travel Time panel:** under the day-counts, one line — *"Jerusalem sits 977 m (3,205 ft)
  above Jericho — the whole descent of the Jericho road."* Only render when both endpoints
  have elevation.
- **Detail sheet:** show a place's own elevation as a metadata line ("744 m above sea level",
  or "233 m **below** sea level" — the below-sea-level ones are the memorable ones: Jericho,
  the Dead Sea, the Jordan valley).
- Show metres and feet both. US-audience app, but elevation is conventionally metric in the
  source data.

**Stretch (only if 3a-3c land cleanly):** a small SVG cross-section in the Travel Time panel
sampling elevation along the origin→destination line. This needs *route* samples, not just
endpoints — another ~20 API points per route, which would have to be fetched at build time for
a fixed set of routes, not on demand. Do not attempt this before the rest works.

---

## Phase 4 — More journeys (ships alone, data only, ~half day each)

The journey machinery is 100% done. This is pure data authoring into
`src/assets/atlas-journeys.json` using the existing schema (see the four Pauline journeys, and
`src/assets/atlas-journeys.test.js` which will validate every stop slug and coordinate).

Priority order:
1. **The Exodus** — Rameses → Succoth → the sea → Sinai → Kadesh-barnea → the plains of Moab.
   The single most-requested biblical route.
2. **Abraham's migration** — Ur → Haran → Shechem → Bethel → Egypt → the Negev → Hebron.
3. **The exile** — Jerusalem → Riblah → Babylon.
4. **The Ark's travels** — Shiloh → Ebenezer → Ashdod → Gath → Ekron → Beth-shemesh →
   Kiriath-jearim → Jerusalem. A genuinely great one; the Ark moves more than most people.
5. **Jesus' ministry circuits** — Nazareth → Capernaum → the Galilee circuit → Caesarea Philippi
   → the final ascent to Jerusalem.

Pull coordinates from `bible-atlas.json` rather than inventing them (as the Pauline set did) so
they stay consistent with the rest of the map. Where a stop isn't in the dataset, set
`place: null` and supply coordinates directly — the schema already allows it.

---

## Phase 5 — Reading-plan and sermon hooks (ships alone, ~1 day)

Turns the atlas from a thing you visit once into a weekly tool.

**The gotcha:** `bible-atlas.json` has **no chapter arrays** — `build-atlas.js` strips `p`
deliberately. Do NOT add them back (it would inflate the main asset by ~180KB). Instead load
`bible-places.json`, which already carries `p` and is **already a shared build chunk** because
PassageMap loads it — so reusing it costs zero additional bytes for anyone who has opened
Scripture Lookup, versus 62.8KB for a purpose-built index.

**Pure helper** (`src/lib/atlas.js`), mirroring what `PassageMap.jsx` already does:

```js
// chapterIds: ['ACT.17', …] → atlas place slugs, best-attested first
export function placesForChapters(biblePlaces, chapterIds)
```

**Entry points:**
- `/atlas?chapters=ACT.17,ACT.18` — the atlas reads the param, pins those places, fits bounds.
- **Reading plan:** an "See today's reading on the map" link in `DailyReading.jsx`. Chapters
  come from `getPlanChapters(plan, day)` in `src/lib/readingPlans.js`, already in `'ACT.17'` form.
- **Sermons:** `sermon_talks.scripture_ref` is free text ("John 3:16-18"); run it through
  `refToPassageIds()` from `src/lib/scripture.js` — exactly the path `PassageMap.jsx` uses —
  then link to the same `/atlas?chapters=…` route from `TalkDetail.jsx`.

Deep-linking via a query param (rather than new component props) keeps the atlas decoupled: any
part of the app can link into it without importing anything.

---

## Phase 6 — Character traces (ships alone, ~half day, scope-limited)

"Show me everywhere Paul went." Feasible, but **only for the figures with enough data** — do not
ship it as a universal button.

**Do not** build this from `entry.p` chapter intersection. Measured: that gives Moses 477
"places" and David 416, nearly all of which they never visited (a chapter that mentions Moses
also names every place in that chapter). Build it from **events**, which already carry both
`pe` (people) and `pl` (resolved places):

```js
export function traceForPerson(atlas, personSlug)  // events with this person, placed, sorted by year
```

**Measured coverage** — offer the trace only when a person has **≥5 placed events (20 people)**:

| | placed events | verdict |
|---|---|---|
| Jesus | 70 | ✅ |
| Paul | 30 | ✅ genuinely excellent |
| Simon Peter | 27 | ✅ |
| Jacob, Abraham, Luke | 11 each | ✅ good |
| Moses | 8 | ⚠️ spans −1570 to **AD 29** — his Transfiguration cameo. Correct, but it makes a "life journey" read oddly; consider clamping a trace to the person's own `y` range |
| David | 3 | ❌ below threshold despite 190 chapters |

**Must exclude** `god_1324` and `holy_spirit_7400` — both clear the ≥5 threshold (11 and 8
placed events) but a "travel route" for either is theologically wrong.

**Do not reuse either existing exclusion set for this** — checked, and neither fits:
- `MATCH_EXCLUDED` is `{god_1324}` only — misses the Holy Spirit.
- `NO_GENERATED_IMAGE` is `{god_1324, holy_spirit_7400, jesus_905}` — correct for *imagery*
  (each org decides whether to depict Jesus), but wrong here: it would silently drop **Jesus,
  who at 70 placed events is the single richest trace in the dataset**. Tracing where Jesus
  travelled is not the same question as depicting him.

Define a purpose-named set in `src/lib/atlas.js` instead:
```js
// Neither MATCH_EXCLUDED nor NO_GENERATED_IMAGE is the right set here — see the plan.
export const NO_TRACE = new Set(['god_1324', 'holy_spirit_7400']);
```

Accuracy caveat to surface in the UI: traces inherit the event→place resolution's ~81.5%
accuracy. Abraham's trace is mostly right but picks up "Babel" and "Rameses" (anachronistic).
Label it "places associated with X in Scripture", not "X's route".

Render by reusing the existing journey layer — a trace is shaped exactly like a journey
(ordered, placed stops), so `AtlasMap`'s polyline + stop markers should be reused rather than
duplicated.

---

## Conventions (unchanged from the original build)

1. Plain JavaScript/JSX. No TypeScript.
2. Lazy-import every asset; never a static import of a JSON asset.
3. Pure, testable logic goes in `src/lib/atlas.js`; Leaflet-touching code gets a smoke test only,
   but Leaflet-*free* components (like `AtlasSearch`, `AtlasDistancePanel`) get real interaction tests.
4. Global content — no `organization_id`, no RLS, no migration, for every phase here.
5. Sibling `.css` per component, `atlas-` prefix, theme via existing custom properties.
6. New top-of-map chrome goes inside `.atlas-chrome`'s flex column — never a new independently
   `top:`-positioned overlay (see the AtlasControls comment for why).
7. `npm run lint` and `npm test` before calling any phase done.

## Testing

| Target | Coverage |
|---|---|
| `src/lib/atlas.test.js` | `elevationDelta` / `describeVertical` (positive, negative, near-zero, missing data); `placesForChapters`; `traceForPerson` incl. the God/Spirit exclusion and the ≥5 threshold |
| `scripts/build-atlas-elevation.js` | `--check` mode; assert null-handling for water points |
| `AtlasDetailSheet.test.jsx` | new — place *with* an image, place *without* (`w: false`), and image `onError` fallback |
| `atlas-journeys.test.js` | already validates new journeys automatically — no new test needed for Phase 4 |

**Visual checks are the maintainer's** (see CLAUDE.md). When a phase lands, name what to eyeball —
for Phase 1 that's whether the sheet's height jump between image/no-image places is acceptable on
a phone; for Phase 2, whether the era autoplay tick rate feels right through the dense Gospels.

## Open decisions

1. **Phase 3 units** — metres-first or feet-first? Plan assumes both, metres first.
2. **Phase 4 journey list** — which five, and in what order? The Ark's travels is the sleeper pick.
3. **Phase 6 labelling** — how hard to caveat traces given ~81.5% resolution accuracy.
4. **Phase 3 stretch** — is the elevation cross-section worth a fixed set of pre-fetched routes?
