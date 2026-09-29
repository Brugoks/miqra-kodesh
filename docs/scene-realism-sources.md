# Biblical Scene Realism — Historical Sourcing & Evidence Base

This document establishes the historical and archaeological evidence base for the 3D reconstructions in `miqra-kodesh`, starting with the Capernaum pilot (c. AD 28). Every major reconstruction claim is identified by a stable evidence ID with certainty ratings, original units, and literature citations.

## Evidence Taxonomy

- **Certainty Ratings**:
  - `attested`: Specifically recorded in primary historical/scriptural texts or directly excavated in situ.
  - `inferred`: Derived from contextual archaeology, contemporary regional parallels, or logical architectural necessity.
  - `illustrative`: Conjectural artistic interpretation within plausible period practices where direct evidence is absent.
- **Evidence Types**:
  - `archaeological`: Material remains, excavations, stratigraphy, structural ruins.
  - `textual`: Primary literary sources (Scripture, Josephus, Mishnah, early rabbinic literature).
  - `comparative`: Contemporary 1st-century Roman/Judean parallels (Gamla, Magdala, Herodian Jericho).
  - `artistic`: Contemporary mosaics, coins, frescoes, or reliefs.

---

## Scene Period Definitions

| Scene Slug | Canonical Period Label | Numeric Reference Year | Basis |
| :--- | :--- | :--- | :--- |
| `capernaum` | `c. AD 28` | `28` | Ministry of Jesus in Galilee; Synoptic accounts (Mark 1–2; Matthew 8–9). |
| `second-temple` | `c. AD 30` | `30` | Herodian expansion under Pontius Pilate and Caiaphas before the 70 AD destruction. |
| `caesarea` | `First century AD · Acts-era interpretation` | `null` | Sebastos harbor and Roman administrative seat during early apostolic visits (Acts 10, 21–26). |
| `tabernacle` | `Wilderness setting · Exodus 25–40` | `null` | Scriptural text specification (1 cubit = 0.5 m); absolute chronological date undetermined. |
| `mount-of-olives` | `c. AD 30` | `30` | The last week in Jerusalem (Mark 11–14; Luke 19–22; John 12, 18) and the ascension (Acts 1). |

---

## Second Temple Events (`c. 6 BC – AD 57`)

#### `TEM-EVENTS-01`
- **Claim**: Where each staged event in the Temple courts happened.
- **Certainty**: `inferred`. Named by the text: the sanctuary and the praying people (Luke 1:8–23), the treasury (Mark 12:41; John 8:20), Solomon’s colonnade (John 10:23), the gate called Beautiful (Acts 3:2). Chosen by the scene: the Nicanor Gate for the presentation (see `TEM-NICANOR-01`), Solomon’s Portico for the boy among the teachers, the south of the outer court for the traders, the gate into the Court of the Women for the Beautiful Gate (its identity is disputed), outside the soreg for Paul’s seizure.
- **Depicted**: `templeEvents.js`, one event staged at a time (`sceneEpisodes.js`).

#### `TEM-NICANOR-01`
- **Claim**: Mothers were purified after childbirth at the Nicanor Gate.
- **Certainty**: `attested` — Mishnah Sotah 1:5; Leviticus 12:6–8; Luke 2:22–24.

#### `TEM-TREASURY-01`
- **Claim**: Thirteen trumpet-shaped offering chests in the Court of the Women.
- **Certainty**: `attested` for the chests (Mishnah Shekalim 6:1, 6:5); their placement along the south wall is reconstruction.

#### `TEM-TYRE-01`
- **Claim**: The temple tax was paid in Tyrian silver, which is why changers sat in the courts.
- **Certainty**: `attested` — Exodus 30:13; Tosefta Ketubbot 13:3; Mishnah Bekhorot 8:7.

#### `TEM-JOHN8-01`
- **Claim**: John 7:53–8:11 is absent from the earliest manuscripts of John.
- **Certainty**: `attested` — Metzger, *A Textual Commentary on the Greek New Testament* (2nd ed. 1994). The event text says so on screen.

#### `TEM-ANTONIA-01`
- **Claim**: The Roman garrison in the Antonia reached the courts by stairs.
- **Certainty**: `attested` — Josephus, *Jewish War* 5.238–247; Acts 21:31–40.

#### `TEM-HANUKKAH-01`
- **Claim**: The Feast of Dedication remembered the rededication of 164 BC.
- **Certainty**: `attested` — 1 Maccabees 4:36–59; Josephus, *Antiquities* 12.316–325.

#### `TEM-MOTION-01`
- **Claim**: How the people move.
- **Certainty**: `illustrative` — captured modern motion (Adobe Mixamo) fitted to each character; see `docs/scene-humans-assets.md`.

## Mount of Olives (`c. AD 30`)

#### `OLV-TERRAIN-01`
- **Claim**: The hillside, the Kidron, the plateau across the valley and the far skyline (the city's western hills; from the summit, the wilderness, the Dead Sea and Moab).
- **Certainty**: `attested` — SRTM-derived AWS Terrain Tiles, sampled every 15 m within 1.2 km of Gethsemane and traced to 48 km for the skyline, with curvature and refraction; baked by `scripts/build-olivet-landscape.py`. Modern surface: the Temple platform is levelled to its court.

#### `OLV-TEMPLE-01`
- **Claim**: The Temple, the Antonia and Herod's towers as seen from the Mount.
- **Certainty**: `inferred` — the platform line from the elevation data; the sanctuary on the rock under the Dome of the Rock with the Temple scene's Middot measurements; the Antonia and the towers from Josephus (*War* 5.184–247, 5.161–175); the line of sight over the eastern wall from Mishnah Middot 2:4.

#### `OLV-GETHSEMANE-01`
- **Claim**: Where Gethsemane was, and what stood in it.
- **Certainty**: `inferred` — John 18:1–2; Mark 14:32. The location is the ancient tradition of the Church of All Nations; the enclosure, gates, press yard and trees are reconstruction. The surviving old olives have been dated to the twelfth century (Bernabei et al. 2015).

#### `OLV-TOMBS-01`
- **Claim**: The three rock-cut monuments in the Kidron.
- **Certainty**: `attested` — surviving monuments (Avigad, *Ancient Monuments in the Kidron Valley*, 1954). Bene Hezir and Zechariah: 2nd–1st c. BC; Absalom's Pillar: 1st c. AD. The courts round them are simplified.

#### `OLV-ROAD-01`
- **Claim**: The line of the road and where on it each moment is staged.
- **Certainty**: `inferred` — Luke 19:37, 41. The road's line is the traditional descent; where on it each moment stands is the scene's choice.

#### `OLV-PASSOVER-01`
- **Claim**: The camps, the season and the fields.
- **Certainty**: `inferred` — Luke 21:37; Leviticus 23:10–14; Mark 11:13, 13:28; Mishnah Rosh Hashanah 2:2–4; Josephus, *War* 6.422–425. The camps, flocks and fields are reconstruction.

#### `OLV-ASCENSION-01`
- **Claim**: Where on the Mount the ascension is staged.
- **Certainty**: `inferred` — Acts 1:12; Luke 24:50. Staged on the summit, following the fourth-century tradition.

## Capernaum Evidence Catalog (`c. AD 28`)

### Architecture & Domestic Life

#### `CAP-ARCH-BASALT-01`
- **Claim**: Domestic village walls constructed of unworked or roughly dressed local black basalt fieldstones bonded with mud, clay, and small packing pebbles, rather than ashlar limestone.
- **Type**: `archaeological`
- **Certainty**: `attested`
- **Source**: Corbo, V. C., *Cafarnao I: Gli edifici della città*, Franciscan Printing Press (1975); Loffreda, S., *Recovering Capharnaum*, Studium Biblicum Franciscanum (1993).
- **Notes**: Excavations by the Studium Biblicum Franciscanum established that 1st-century residential insulae were uniformly built from porous local volcanic basalt boulders without lime mortar.

#### `CAP-ARCH-ROOF-01`
- **Claim**: Domestic roofs consisted of wooden rafters overlaid with brushwood, reeds, palm fronds, and packed earthen marl rolled flat, requiring regular seasonal re-rolling.
- **Type**: `archaeological` / `textual`
- **Certainty**: `attested`
- **Source**: Mark 2:4 ("they removed the roof above him, and when they had dug through, they let down the bed"); Loffreda (1993). Cf. Luke 5:19, which says "through the tiles" — best read as Luke putting the story in terms his readers, who knew tiled roofs, would picture; the archaeology finds no roof tiles in early domestic strata here.
- **Span**: local timber limited unsupported spans to about 3–3.5 m. The room shown as Peter's house is unusually wide (about 6 m inside); its later phase added a transverse arch to carry the roof. The scene draws beams spanning it unsupported — a known simplification.
- **Notes**: Rafter spans were constrained by local timber (sycamore, olive, tamarisk), generally limiting room width to 3.0–3.5 meters. The absence of tile fragments in early 1st-century domestic strata confirms mud-and-reed terracing.

#### `CAP-ARCH-INSULA-01`
- **Claim**: Houses were arranged in insulae—clusters of modest, single-story windowless rooms sharing communal open courtyards with exterior stone stairs leading to flat functional roofs.
- **Type**: `archaeological`
- **Certainty**: `attested`
- **Source**: Corbo (1975), Insula I (the "House of St. Peter"); Hirschfeld, Y., *The Palestinian Dwelling in the Roman-Byzantine Period*, Franciscan Printing Press (1995).
- **Notes**: Domestic units lacked interior hallways; movement flowed through courtyards where cooking ovens (tabuns), grinding stones, and basalt basins were located.

#### `CAP-ARCH-SYN-01`
- **Claim**: The synagogue Jesus taught in was probably a basalt building beneath the monumental white limestone synagogue (late 4th–6th century).
- **Type**: `archaeological` / `textual`
- **Certainty**: `probable` (that the basalt remains are that synagogue — disputed); `illustrative` (benches, columns, plan)
- **Source**: Corbo (1975); Loffreda, S., *Recovering Capharnaum* (1985; 2nd ed. 1993); Mark 1:21; Luke 7:5.
- **Note**: whether the basalt walls and pavement beneath the white limestone synagogue (late 4th–6th century) are a first-century synagogue is disputed — Corbo assigns the basalt wall to it, Loffreda places it in an intermediate phase above a first-century pavement, others read the pavement as an open paved area. Benches, columns and plan are modelled on the excavated first-century synagogues at Magdala and Gamla.
- **Notes**: Excavation beneath the nave of the white limestone synagogue revealed black basalt foundations dating to the late 1st century BC / early 1st century AD. The reconstruction shows basalt walls with perimeter stone benches similar to Magdala and Gamla, avoiding late limestone ornament.

#### `CAP-SYN-INTERIOR-01`
- **Claim**: The hall inside: stepped stone benches on all four sides, columns carrying the roof, a table at the centre for the scroll, and plastered walls painted in coloured panels.
- **Type**: `comparative` (archaeological parallels)
- **Certainty**: `inferred` — Capernaum's own first-century interior is not preserved; every element is taken from the first-century synagogues at Magdala (painted plaster panels in red, yellow and green; the carved stone at the centre of the hall) and Gamla (stepped benches round the walls, columns).
- **Source**: Aviam, M., "The Decorated Stone from the Synagogue at Migdal", *Novum Testamentum* 55 (2013); Syon, D. & Yavor, Z., *Gamla II: The Architecture* (IAA Reports 44, 2010); Levine, L. I., *The Ancient Synagogue* (2nd ed. 2005); the Theodotos inscription (CIJ 1404), "for the reading of the law and the teaching of the commandments".
- **Depicted**: `capernaumDimensions.js` `SYNAGOGUE_HALL`, `SYNAGOGUE_BENCHES`, `synagogueColumns()`, `READING_TABLE`; the Magdala stone's carving is not reproduced — a plain basalt table stands in its place.

#### `CAP-SYN-SABBATH-01`
- **Claim**: Jesus taught on a sabbath in the synagogue at Capernaum and rebuked an unclean spirit in a man there.
- **Type**: `textual`
- **Certainty**: `illustrative` for the staging. The event is Mark 1:21–28 and Luke 4:31–37; that the teacher sat follows Luke 4:20. Women attended synagogue (Luke 13:10–17) but where they sat is not known. Poses, clothing and who sat where are reconstruction.
- **Depicted**: `synagogueTableau.js` — the moment of the rebuke; the attendant at the scroll (Luke 4:20), a ruler of the synagogue (Mark 5:22; Acts 13:15), two scribes apart with folded arms (Mark 1:22).

#### `CAP-EVENTS-01`
- **Claim**: Where each staged event happened.
- **Type**: `textual` / `interpretive`
- **Certainty**: `inferred`. Named by the text: the synagogue (Mark 1:21; John 6:59); the house of Simon and Andrew, its door and its roof (Mark 1:29–33; 2:1–4; 9:33); the tax booth beside the sea (Mark 2:13–14); the centurion and the temple tax “in Capernaum” (Matthew 8:5; 17:24). Chosen by the scene: which stretch of shore for Mark 1:16–20; the street below the synagogue for the centurion; the shore street for Mark 5:21–34, which Mark sets “beside the sea” without naming the town; the west pier for Matthew 17:27, which records the instruction but not the catch.
- **Depicted**: `capernaumEvents.js`, `synagogueTableau.js`, `mark2Tableau.js`, `matthew9Tableau.js`; one event is staged at a time (`buildCapernaum.js` `setEpisode`). The hole in the roof is shown only for Mark 2, and the roof is mended in every other event.

#### `CAP-FISH-BARBEL-01`
- **Claim**: The fish of Matthew 17:27 is shown as a barbel, not a tilapia.
- **Type**: `comparative` (natural history)
- **Certainty**: `probable` — tilapia (“St Peter’s fish”) feed on plankton and are taken in nets; the lake’s barbels are predators taken on hook and line.
- **Source**: Nun, M., *The Sea of Galilee and Its Fishermen in the New Testament* (1989).

#### `CAP-COIN-TYRE-01`
- **Claim**: The coin in the fish’s mouth is a Tyrian shekel, the temple tax for two.
- **Type**: `textual` / `numismatic`
- **Certainty**: `attested` — the half-shekel tax of Exodus 30:13 was paid in Tyrian silver; a shekel (a four-drachma stater) paid it for two men.
- **Source**: Exodus 30:11–16; Matthew 17:24–27; Mishnah Bekhorot 8:7; Tosefta Ketubbot 13:3.

#### `CAP-TZITZIT-01`
- **Claim**: Tassels with a cord of blue at the corners of Jesus’ cloak.
- **Type**: `textual`
- **Certainty**: `attested` for the practice; `illustrative` for the tassels’ form.
- **Source**: Numbers 15:38–39; Deuteronomy 22:12; Matthew 9:20; 14:36; 23:5; Luke 8:44.

#### `CAP-CENTURION-01`
- **Claim**: The centurion carries a vine staff and wears his sword on the left.
- **Type**: `comparative`
- **Certainty**: `inferred` — Roman practice; Galilee was Herod Antipas’s, and how closely his troops followed Roman practice is not known.
- **Source**: Pliny, *Natural History* 14.19; Tacitus, *Annals* 1.23; the tombstone of the centurion M. Favonius Facilis (Colchester).

---

### Maritime & Fishing Industry

#### `CAP-BOAT-GINOSAR-01`
- **Claim**: The standard Sea of Galilee commercial fishing vessel measured ~8.27 m length, 2.30 m beam, 1.25 m depth, constructed carvel-style (mortise-and-tenon joints) using predominantly reused timber (cedar, oak).
- **Type**: `archaeological`
- **Certainty**: `attested`
- **Source**: Wachsmann, S., *The Sea of Galilee Boat: A 2000 Year Old Discovery from the Sea of Galilee*, Plenum Press (1995); Israel Antiquities Authority Report (1990).
- **Original Dimensions**: Length 8.27 m, beam 2.30 m, height 1.25 m.
- **Reconstruction Note**: The primary shore boat matches the Ginosar boat lines exactly, with rib frames, sheer strakes, rowing benches, and stern helmsman platform.

#### `CAP-FISH-NETS-01`
- **Claim**: Fishermen used circular cast nets (*amphiblestron*) with perimeter lead sinkers and trammel/seine nets (*sagene*) with cork or pumice floats and stone weights, requiring daily washing, drying, and mending.
- **Type**: `textual` / `archaeological`
- **Certainty**: `attested`
- **Source**: Mark 1:16–19; Nun, M., *The Sea of Galilee and Its Fishermen in the New Testament*, Kibbutz Ein Gev (1989).
- **Notes**: Authentic depiction features drying racks along the basalt boulder shore with net mesh openings and stone/lead line weights.

---

### Everyday Material Culture & Props

#### `CAP-PROP-POTTERY-01`
- **Claim**: Domestic ceramics consisted of Galilean ribbed storage jars, small handle jugs, globular cooking pots with grooved rims, and Herodian wheel-made spouted oil lamps.
- **Type**: `archaeological`
- **Certainty**: `attested`
- **Source**: Adan-Bayewitz, D., *Common Pottery in Roman Galilee: A Study of Local Trade*, Bar-Ilan University Press (1993); SBF Capernaum excavation ceramics catalogs.
- **Notes**: Shivering/buff-to-red terracottas produced primarily in Kfar Hananya; distinct absence of fine imported Roman red-slip Terra Sigillata in the domestic fishermen's quarters.

#### `CAP-PROP-BASKET-01`
- **Claim**: Baskets woven from date palm fronds (*lulav*) and reeds (*juncus*), used for carrying fish, grain, and olives, alongside coiled hemp and flax cordage.
- **Type**: `comparative` / `archaeological`
- **Certainty**: `inferred` (Cave of the Letters parallels, Yadin 1963).

---

### Landscape & Hydrology

#### `CAP-GEO-SHORE-01`
- **Claim**: The northern shoreline of the Sea of Galilee (Kinneret) sloped gently over basalt scree, rounded gravel pebbles, and patches of seasonal reeds (*Phragmites australis*). *Corrected:* this entry previously also claimed there were no formal stone quays or seawalls at Capernaum, which its own source contradicts — see `CAP-HARB-NUN-01`.
- **Type**: `archaeological` / `comparative`
- **Certainty**: `attested` (shore form)
- **Source**: Nun (1989); Masterman, E. W. G., *Studies in Galilee*, University of Chicago Press (1909).
- **Elevation**: -209 m to -212 m relative to Mediterranean sea level.

#### `CAP-HARB-NUN-01`
- **Claim**: Mendel Nun's survey of the Kinneret's ancient harbours recorded at Capernaum a long stone-faced promenade with piers of basalt fieldstone (some paired to enclose basins) and pierced mooring stones.
- **Type**: `archaeological`
- **Certainty**: `probable` — the works are real; how much of them existed by c. AD 28 is debated (Roman, possibly later phases).
- **Source**: Nun, M., *The Sea of Galilee: Newly Discovered Harbours from New Testament Days*, Kibbutz Ein Gev (1989); Nun, M., "Ports of Galilee", *Biblical Archaeology Review* 25:4 (1999).
- **Depicted**: two piers of basalt fieldstone flush with the promenade, with kerbs and pierced mooring stones (`capernaumDimensions.js` `PIERS`); deliberately fewer than the survey describes.

#### `CAP-GEO-HORIZON-01`
- **Claim**: The skyline and near terrain are computed from SRTM elevation data: the Golan escarpment as a near-level wall at 2.0–2.45° across the water (64°–166° bearing), Arbel's wedge rising to 2.28° at 228.5°, the Korazim/Eremos slope at 2.6–6.2° to the north and west, and a true water horizon due south. Mount Hermon, Tabor, Meron and Chorazin are hidden from the shore by nearer ground.
- **Type**: `geographic` (measured)
- **Certainty**: `attested`
- **Source**: AWS Terrain Tiles (SRTM, terrarium, zoom 12), cross-checked against OpenTopoData srtm30m; `scripts/build-capernaum-landscape.py`.

#### `CAP-LIFE-01`
- **Claim**: Mixed flocks of black goats and fat-tailed sheep folded at night behind dry-stone walls; donkeys as pack animals on the road through the customs post; hens and roosters kept in courtyards.
- **Type**: `textual` / `archaeological`
- **Certainty**: `attested`
- **Source**: Borowski, O., *Every Living Thing: Daily Use of Animals in Ancient Israel* (1998); Matthew 23:37; John 10:1–16.

#### `CAP-ARCH-PARAPET-01`
- **Claim**: Flat roofs in use carried a parapet (Deuteronomy 22:8).
- **Type**: `textual`
- **Certainty**: `inferred` — the requirement is textual and not attested archaeologically at Capernaum. The 0.8 m height follows the later rabbinic minimum of ten handbreadths (Sifre Deuteronomy 229; b. Bava Kamma 15b).

#### `CAP-SEASON-01`
- **Claim**: The scene shows late spring — barley harvested, wheat ripening, oleander and thistles in flower.
- **Type**: `interpretive`
- **Certainty**: `illustrative` — a choice consistent with Mark 2:23, not a date the text gives.

#### `CAP-GEO-RIDGE-01`
- **Claim**: The topography immediately behind Capernaum rises steadily northward toward the Korazim basalt plateau and the Upper Galilee hills, while the eastern view is dominated by the volcanic slopes of the Golan Heights across the Jordan delta.
- **Type**: `comparative` (Survey of Western Palestine; modern elevation models).
- **Certainty**: `attested` (topographical form).
