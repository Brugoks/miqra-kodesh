# The Ancient World — Atlas Implementation Plan

**Feature:** A pannable, zoomable, time-scrubbable map of the biblical world at `/atlas`.
Drag through nine eras and watch places, events, empires and journeys appear and vanish.
Zoom from the whole known world (Tarshish to Persia) down to a single village. Tap anything
to open its existing Bible Wiki page.

**Framing (do not drift from this):** this is a *reading aid*, not a history engine and not a
game. Every pin traces back to a scripture reference. The app does not adjudicate contested
history — it renders the chronology already baked into `bible-events.json` and says so on
screen. No user plays as a nation; no battle has a "winner" the user controls.

**Build order matters.** Phase 0 is the only blocking phase. Phases 1–5 each ship
independently and each is a usable product on its own. Do not start Phase 2 before Phase 1
is merged.

---

## What already exists (verified, do not rebuild)

| Asset | Contents |
|-------|----------|
| `src/assets/bible-events.json` | 450 events, **400 dated**, range −4003 → AD 57. Shape `{s,n,fv,p,y,pe}` — slug, name, first verse, chapter list, year, people slugs. **No place link. This is the gap.** |
| `src/assets/bible-places.json` | 1,252 geocoded places from openbible.info (CC-BY). Shape `{n,la,lo,p}` — name, lat, lon, chapter list. **No slug field.** |
| `src/assets/bible-wiki.json` | 231 people + 150 places. Place shape `{s,n,la,lo,p,desc}` — **has slugs.** |
| `src/lib/bibleWiki.js` | `loadBibleWiki()`, `loadBibleEvents()`, `formatYear()`, `formatYearRange()`, `buildChapterIndex()`. All assets dynamic-imported. |
| `src/components/PassageMap.jsx` | Leaflet already a dependency. Tile strategy already solved — Thunderforest `atlas` + `lang=en` when `VITE_THUNDERFOREST_KEY` is set, CARTO `voyager_nolabels` fallback. `maxZoom: 12`. |
| `src/components/wiki/WikiPlaceMap.jsx` | The lazy-Leaflet + cleanup pattern to copy. |
| `src/components/reels/CharacterReels.jsx` | The immersive full-screen route pattern. |
| `sharp` ^0.35.3 (devDep) + `scripts/migrate-wiki-images-to-r2.js` | Tile slicing and R2 hosting are already possible with zero new dependencies. |

**No new npm dependency is required for any phase.**

---

## Measured facts the design rests on

Re-derive these with a script if you change the source assets; do not assume they still hold.

**Place significance is already encoded** as `p.length` (how many chapters mention the place):

| Tier | `p.length` | Count | Examples |
|------|-----------|-------|----------|
| 1 | ≥ 21 | **32** | Jerusalem (293), Egypt (215), Zion (93), Jordan (91), Babylon (73), Moab (58), Samaria (51), Canaan (50), Assyria (48), Edom (48) |
| 2 | 6–20 | 131 | regional cities |
| 3 | 2–5 | 380 | towns |
| 4 | 1 | 709 | villages, single mentions |

**The slug join is free.** All 150 wiki places match a geocoded place by normalized name
(`lowercase`, strip non-alphanumeric), and **all 32 tier-1 places have wiki slugs**. So every
pin visible below z6 links to a real page. The 1,102 unmatched places are the long tail and
are map-only (no wiki link) — that is acceptable, they only render at z10+.

**Density is extremely concentrated.** 908 of 1,252 places (73%) sit inside a 3°×2° box around
Israel. Without zoom tiering the world view is one unreadable blob. Tiering is not a polish
item; it is load-bearing.

**Events are wildly uneven across time** — this kills any single global time window:

| Era | Span | Dated events |
|-----|------|--------------|
| Primeval | −4003 → −2100 (1903 yr) | 61 |
| Patriarchs | −2100 → −1500 (600 yr) | 63 |
| Exodus & Conquest | −1500 → −1050 (450 yr) | 35 |
| United Kingdom | −1050 → −930 (120 yr) | 13 |
| Divided Kingdom | −930 → −586 (344 yr) | 71 |
| Exile & Return | −586 → −400 (186 yr) | 4 |
| Intertestamental | −400 → −5 (395 yr) | **0** |
| Gospels | −5 → AD 33 (38 yr) | **118** |
| Acts & the Church | AD 33 → 100 (67 yr) | 35 |

118 events in 38 years vs 0 events in 395 years. The scrubber must be **era-segmented with a
per-era window**, not linear.

**Geographic extent:** lat 9.02 → 46.0, lon −6.38 → 77.0. Covers Tarshish/Spain through Persia —
every Pauline stop and every OT empire is already in the data.

---

## Phase 0 — Data foundation (BLOCKING, scripts only, no UI)

Produces one new asset. **Do not modify `bible-events.json` or `build-bible-wiki.js`** — the
wiki build and `WikiTimeline` depend on them and must not regress. The atlas build *reads*
those assets and emits its own.

### `scripts/build-atlas.js` → `src/assets/bible-atlas.json`

Reads `bible-events.json`, `bible-places.json`, `bible-wiki.json`, plus a hand-maintained
override file. Emits a lean atlas payload that **drops the fat `p` chapter arrays** (the atlas
does not need them after build — this is what keeps the payload ~100KB instead of ~280KB).

```jsonc
{
  "meta": { "built": "2026-09-03", "events": 400, "places": 1252, "chronology": "traditional" },
  "eras": [
    { "s": "primeval", "n": "Primeval", "from": -4003, "to": -2100, "window": 150 },
    { "s": "patriarchs", "n": "Patriarchs", "from": -2100, "to": -1500, "window": 60 },
    { "s": "exodus-conquest", "n": "Exodus & Conquest", "from": -1500, "to": -1050, "window": 50 },
    { "s": "united-kingdom", "n": "United Kingdom", "from": -1050, "to": -930, "window": 25 },
    { "s": "divided-kingdom", "n": "Divided Kingdom", "from": -930, "to": -586, "window": 30 },
    { "s": "exile-return", "n": "Exile & Return", "from": -586, "to": -400, "window": 40 },
    { "s": "intertestamental", "n": "Between the Testaments", "from": -400, "to": -5, "window": 50 },
    { "s": "gospels", "n": "The Gospels", "from": -5, "to": 33, "window": 3 },
    { "s": "acts-church", "n": "Acts & the Church", "from": 33, "to": 100, "window": 8 }
  ],
  "places": [
    { "s": "jerusalem", "n": "Jerusalem", "la": 31.7774, "lo": 35.2349, "t": 1, "cc": 293, "w": true }
  ],
  "events": [
    { "s": "the-fall", "n": "The Fall", "y": -4003, "fv": "GEN.3.1",
      "era": "primeval", "pl": ["eden"], "cf": 0.82, "pe": ["adam_78", "eve_1231"] }
  ]
}
```

Field notes: `t` = tier (1–4), `cc` = chapter count (kept for tooltips/sorting), `w` = has a
wiki page, `pl` = resolved place slugs ranked best-first, `cf` = confidence 0–1.

### The event→place resolution algorithm (the hard part)

> **Superseded, 2026-09-05.** The scoring below is now only the *fallback*, used for the
> ~40 events that have no curated place. `bible-events.json` turned out to carry its own
> hand-curated `pl` array for 241 of the 400 dated events, and the original build ignored it
> entirely — disagreeing with it 224 times out of 241, which is how "Abraham goes to Egypt"
> was pinned at Moreh and every Divided-Kingdom reign at Janoah, a village named once in
> 2 Kings 15. The order of authority is now overrides → curated `pl` → the scoring below.
> Two guards were added to the fallback itself: uncurated biographical events (the Genesis 5
> and 11 genealogies) stay unplaced rather than resolving to the rarest toponym in their
> chapter, and single-chapter events rank by prominence rather than rarity, because coverage
> cannot discriminate when every candidate scores 1.0. See the resolution block in
> `scripts/build-atlas.js` and the invariant tests in `src/lib/atlas.test.js`.
>
> Measured effect: events pinned into suspect clusters on obscure tier-3/4 places fell from
> 112 of 326 (34%) to 9 of 283 (3%).


Events carry chapters (`p`) but no place. Resolve by scoring every place whose chapters
intersect the event's chapters. This is TF-IDF: reward coverage, punish ubiquity.

```
fvChapter = chapter part of E.fv           // "GEN.3.1" -> "GEN.3"
candidates = places P where |P.p ∩ E.p| > 0

for each candidate P:
  overlap     = |P.p ∩ E.p|
  coverage    = overlap / |E.p|            // how much of the event this place covers
  specificity = 1 / log2(|P.p| + 2)        // Egypt(215) scores ~0.13, Eden(2) scores ~1.0
  fvBonus     = fvChapter ∈ P.p ? 1.5 : 1.0
  score       = coverage * specificity * fvBonus

keep top 3 with score >= 0.15, ranked desc
cf = top score, clamped to [0,1]
```

The `specificity` term is the whole trick. Without it every event resolves to Jerusalem or
Egypt, because those appear in hundreds of chapters.

**Expect roughly 70% usable output.** Handle the rest explicitly:

1. Events that resolve **only** to a tier-1 mega-place with `cf < 0.3` → write to
   `scripts/atlas-review.json` (git-ignored) for a manual or LLM pass. Do not silently ship them.
2. Events with genuinely no place ("Lifetime of Adam", genealogies) → emit `pl: []`. These are
   valid and must be excluded from the map, not forced onto it.
3. `src/assets/atlas-overrides.json` — hand corrections keyed by event slug, merged **last**,
   always winning. Follows the existing `bible-wiki-curated.json` convention.

```jsonc
{ "the-fall": { "pl": ["eden"], "cf": 1 },
  "battle-of-jericho": { "pl": ["jericho"], "k": "battle", "att": "israel", "def": "canaan" } }
```

### Place tiering and slug reconciliation

```
tier = cc >= 21 ? 1 : cc >= 6 ? 2 : cc >= 2 ? 3 : 4
slug = wiki place slug matched by norm(name), else `map-${norm(name)}`
w    = whether a wiki slug was found
```

`norm(s) = s.toLowerCase().replace(/[^a-z0-9]/g, '')`. All 150 wiki places match; assert that
count in the build and fail loudly if it drops — a silent drop means the wiki build changed.

### Determinism

The build must be deterministic: stable sort by slug, round coords to 4dp, no timestamps
except `meta.built`. Add `node scripts/build-atlas.js --check` that rebuilds in memory and
diffs against the committed asset, so CI can catch drift.

---

## Phase 1 — The map (ships alone, no time dimension)

Route `/atlas`. Full-screen immersive Leaflet map, label-free relief basemap, zoom-tiered
place pins, tap → detail sheet → wiki. **No scrubber yet** — all places, all eras.

### Zoom tiers

| Tier | minZoom | Count shown |
|------|---------|-------------|
| 1 | 3 | 32 |
| 2 | 6 | +131 |
| 3 | 8 | +380 |
| 4 | 10 | +709 |

Map `minZoom: 3`, `maxZoom: 12` (matches `PassageMap`). Recompute the visible set on Leaflet's
`zoomend`, not on every `move` — filtering 1,252 rows on every pan frame will jank on phones.

### Basemap

Phase 1 uses a **label-free relief** layer so the map reads as ancient (no modern city names,
no national borders in the tile art) while your own pins supply every name on screen. Start
with the CARTO `voyager_nolabels` layer already used as `PassageMap`'s fallback — it is already
attributed correctly in this repo. Do **not** use the Thunderforest `atlas` layer here; its
whole purpose is modern English labels, which is the opposite of what the atlas wants.

Keep the existing rule from `PassageMap.jsx`: **tiles must never be proxied through an edge
function.** A map view fires dozens of tile requests per pan.

### Files

```
src/components/atlas/
  Atlas.jsx              route shell (immersive), owns year/era/layer state
  Atlas.css
  AtlasMap.jsx           the Leaflet instance, layers, markers, zoom tiers
  AtlasDetailSheet.jsx   bottom sheet for a tapped place or event
  useAtlasData.js        loader hook (lazy-imports bible-atlas.json)
src/lib/atlas.js         PURE helpers — no React, no Leaflet
src/lib/atlas.test.js
```

`src/lib/atlas.js` must hold every piece of logic worth testing: `eraForYear`, `minZoomForTier`,
`visiblePlaces(places, zoom)`, `eventsInWindow(events, year, era)`, `placeById`. Keeping these
pure is the entire testing strategy — Leaflet is near-untestable in jsdom, so the component
gets only a smoke test and the logic gets real coverage.

### Wiring

- `src/App.jsx` — add `<Route path="/atlas" element={<Atlas />} />` near the `/timeline` route (~line 865).
- `src/components/Layout.jsx:90` — `immersive` is currently `currentPath === '/reels'`. Change to a
  set/array membership test including `/atlas`. The `layout-main--reels` class name is now
  misleading; either reuse it or add `layout-main--immersive` and apply both.
- `src/components/Layout.jsx:57–59` — add `{ path: '/atlas', label: 'Ancient World', icon: Globe }`
  next to Bible Wiki and Timeline.

---

## Phase 2 — Time

Adds the era-segmented scrubber. This is where the feature becomes what it is for.

### The scrubber

Nine eras, **equal screen width each**, internally linear. Equal width (not proportional to
years) is deliberate: it gives the Gospels' 38 dense years the same real estate as the
Primeval 1,903, which matches both the data density and how people actually think about
biblical history.

State is a single `year` integer. Derived: `era = eraForYear(year)`.

### Windowing

Showing only events at exactly year Y shows almost nothing. Show everything within the
**current era's** window:

```
visible = events.filter(e => e.pl.length && Math.abs(e.y - year) <= era.window)
opacity = 1 - (Math.abs(e.y - year) / era.window) * 0.6      // 1.0 at centre, 0.4 at edge
```

Per-era windows come from the `eras` table in the asset (150 for Primeval down to 3 for the
Gospels). The opacity falloff is what makes dragging feel alive instead of poppy.

**Between the Testaments has 0 events.** Do not treat this as a bug or a reason to drop the
era. It is the most interesting empty space on the map — with Phase 4 polities enabled, this
is where the user watches Persia give way to Greece and then Rome with no biblical narrative
running. Show a short explanatory card in the sheet when the scrubber lands there.

### Mobile

The scrubber sits at the bottom where the tab bar normally lives. Use
`padding-bottom: env(safe-area-inset-bottom)` — the repo does this throughout for PWA
standalone mode. Make the drag target at least 44px tall.

---

## Phase 3 — Journeys

Hand-authored ordered routes, animated as an accreting polyline. This is the "see Paul's
missionary journeys" deliverable and it is the smallest genuinely impressive thing here.

### `src/assets/atlas-journeys.json`

```jsonc
{
  "journeys": [
    {
      "s": "paul-first-journey",
      "n": "Paul's First Missionary Journey",
      "y": [46, 48], "era": "acts-church",
      "color": "#c2410c", "ref": "ACT.13-14",
      "stops": [
        { "place": "antioch-on-the-orontes", "la": 36.20, "lo": 36.16,
          "ref": "ACT.13.1", "note": "Sent out by the church at Antioch" },
        { "place": "seleucia", "la": 36.12, "lo": 35.93, "ref": "ACT.13.4", "note": "Sailed from here" }
      ]
    }
  ]
}
```

Stops carry **explicit `la`/`lo` as well as a `place` slug**. The coords are what the map draws;
the slug is only for the wiki link. A journey must not break because a slug went missing.

Ship Paul's four voyages first (three journeys + the voyage to Rome, ~45 stops total, all
straight out of Acts). Then: the Exodus, Abraham's migration, the exile routes, Jesus'
ministry travels.

Playback: a play button animates a marker along the polyline, drawing the path behind it and
opening each stop's card as it arrives. Use `requestAnimationFrame` interpolation between
stops, not CSS transitions — Leaflet coordinates need reprojection on zoom.

---

## Phase 4 — Polities and battles (the geopolitical layer)

The most data-expensive phase and the only one with real editorial risk.

### `src/assets/atlas-polities.json` — GeoJSON FeatureCollection

> **Updated, 2026-09-05.** This file is now **generated**, not hand-authored. The shapes it
> originally shipped with were 4-7 point boxes whose edges ran straight out to sea, across the
> Dead Sea and through the Sea of Galilee — they read as obvious rectangles sitting on top of a
> real basemap. `scripts/build-atlas-polities.js` now clips each territory to Natural Earth 10m
> land and lakes, so seaward edges follow the actual coastline and the Dead Sea and Sea of
> Galilee punch through as holes. Inland edges are unchanged and remain deliberately approximate.
>
> The hand-authored source moved to `src/assets/atlas-polity-extents.json` — **edit that, never
> the generated file.** Extents must stay **convex**: the clip is Sutherland-Hodgman, which is
> exact only for a convex clip region, so a concave extent silently loses area (this is how
> Jerusalem briefly fell outside Judah). Both the build and `atlas-polities.test.js` fail loudly
> on a concave extent. No new npm dependency was needed.
>
> 74 points across 13 polities became 1,867; the asset went from 4.5KB to 98KB raw
> (1.1KB → 11.1KB gzipped), still well inside the ~150KB budget below.


```jsonc
{ "type": "FeatureCollection", "features": [
  { "type": "Feature",
    "properties": { "s": "assyria", "n": "Assyrian Empire", "from": -911, "to": -609,
                    "color": "#7c2d12", "wiki": "assyria" },
    "geometry": { "type": "Polygon", "coordinates": [[[/* ... */]]] } }
]}
```

Filtered against the scrubber year by `from`/`to`, rendered as translucent fills beneath the
pins. **Simplify geometry hard** — round to ~0.1° and keep the whole file under ~150KB. These
are teaching shapes, not survey boundaries, and coarse polygons are honest about that.

~20 polities × the eras they span: Egypt, Assyria, Babylon, Persia, Greece, Rome, Israel,
Judah, Philistia, Aram, Moab, Edom, Ammon, Phoenicia, Hittites, Midian, Amalek, Nabatea.

Note that the tier-1 place list *already contains* most of these (Egypt, Babylon, Assyria,
Moab, Edom, Canaan) as single lat/lon points. Upgrading those specific entries from point to
polygon is exactly what this phase is.

### Battles

Add to `atlas-overrides.json` rather than a new file: `k: "battle"`, `att` (attacker polity
slug), `def` (defender polity slug). Render as a curved arrow from attacker territory to the
event's place. Only annotate battles the text actually narrates.

### Editorial guardrails

Ancient borders and dates are genuinely contested, and `bible-events.json` commits to a
traditional chronology (creation at −4003). Put a persistent, dismissible note in the atlas
UI naming the chronology and stating that territories are approximate teaching outlines.
Do not present either as settled history.

---

## Phase 5 — Parchment tiles (optional aesthetic upgrade)

Only worth doing after Phases 1–3 prove the feature. Makes the low zooms look like an ancient
atlas instead of a modern basemap with the labels turned off.

### The critical constraint

**Do not AI-generate map imagery.** A generated "ancient map" will hallucinate coastlines, and
every pin will then sit in the wrong place relative to the art. Georeferencing must be exact
by construction.

The correct method is to **restyle real geodata**: take public-domain Natural Earth raster
relief (public domain — this also sidesteps the ODbL derivative-tile question entirely),
slice it to the tile grid, and apply a *pointwise* sepia/parchment color transform with
`sharp`. A pointwise transform is perfectly seamless across tile edges by definition.

### Tile budget (computed for the real bbox)

| Zoom | Grid | Tiles | Master image |
|------|------|-------|--------------|
| 3 | 3×2 | 6 | 768×512 (0.4MP) |
| 4 | 5×3 | 15 | 1280×768 (1.0MP) |
| 5 | 8×5 | 40 | 2048×1280 (2.6MP) |
| 6 | 16×9 | 144 | 4096×2304 (9.4MP) |
| 7 | 31×16 | 496 | 7936×4096 (32.5MP) |
| 8 | 60×31 | 1860 | 15360×7936 (122MP) |

**z3–z6 is 205 tiles total** from a single 9.4MP master — trivial to generate and host on R2
alongside the wiki images. z7+ explodes (and at that zoom the user wants real geography
anyway), so **cross-fade to the relief basemap at z7**. Two `L.tileLayer`s with opacity driven
by `zoomend`.

If a paper-grain texture is added, slice it from one large noise image using each tile's
global pixel offset, or it will visibly repeat every 256px.

---

## Conventions this repo enforces (Sonnet: read before writing code)

1. **Plain JavaScript/JSX. No TypeScript.**
2. **Lazy-import every asset**: `import('../assets/bible-atlas.json')`. Never a static import —
   it would land the payload in the initial bundle.
3. **Lazy-import Leaflet and its CSS together**, exactly as `WikiPlaceMap.jsx` does:
   `await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])`.
4. **Guard double-init and clean up.** React StrictMode double-fires effects; `WikiPlaceMap`
   guards with `if (cancelled || !mapEl.current || mapRef.current) return;` and calls
   `map.remove()` in cleanup. Copy that.
5. **Never proxy tiles through an edge function** (see the comment block in `PassageMap.jsx`).
6. **This is global content.** No `organization_id`, no RLS policy, no migration. The atlas is a
   bundled static asset like the wiki. Only a future user-pins/notes feature would need org scoping.
7. **Sibling `.css` file per component**, class prefix `atlas-`, theme via existing custom
   properties (`--accent-gold`, `--bg-secondary`, …) so the atlas rebrands per organization.
8. **`public/sw.js`** — new hashed assets under `/assets/` need no change. Bump `CACHE_VERSION`
   only if you touch caching *logic*. R2-hosted tiles are cross-origin and are never intercepted.
9. **Safe-area insets** on anything anchored to a viewport edge.
10. Run `npm run lint` and `npm test` before declaring any phase done.

---

## Testing

Colocated `*.test.js` / `*.test.jsx`, vitest + jsdom, per repo convention.

| Target | Coverage |
|--------|----------|
| `src/lib/atlas.test.js` | `eraForYear` across all nine boundaries incl. the AD/BC transition and out-of-range years; `minZoomForTier`; `visiblePlaces` counts per zoom (assert the 32/163/543/1252 cumulative totals); `eventsInWindow` centre/edge/outside; opacity falloff endpoints |
| `scripts/build-atlas.js` | `--check` mode diffs a fresh build against the committed asset; assert 150 wiki slugs matched and 400 dated events survive |
| `Atlas.test.jsx` | Smoke only — renders, shows a loading state, resolves. Do not try to assert Leaflet internals in jsdom |
| `atlas-journeys.json` | A test asserting every stop's `place` slug resolves and `la`/`lo` are finite |

**Visual checks are the maintainer's, not the agent's** (see CLAUDE.md). When a phase lands,
state plainly what to eyeball — for Phase 2 that is the scrubber's touch target on a narrow
phone and whether the per-era window feels right when dragging through the Gospels.

---

## Open decisions for the maintainer

1. **Chronology note wording** — the events data uses a traditional (Ussher-style) chronology.
   What exactly should the on-screen note say?
2. **Who authors the polity polygons** (Phase 4)? This is the one piece with no existing source
   in the repo and real editorial weight.
3. **Is Phase 5 worth the R2 storage and the generation pass**, or is label-free relief good enough?
4. **Does "Between the Testaments" stay** as an era with zero events, carried by polities alone?
