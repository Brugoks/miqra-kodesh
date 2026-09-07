> **Concept brief, not a shipped-feature inventory.** The character-specific wardrobe, props, historical identifications and demographic claims below were proposals from an earlier handoff and have not been independently established. For what is actually implemented, use [the asset documentation](scene-humans-assets.md). The current three models are anonymous interpretive background people, not certified reconstructions of first-century demographics.

# Scene Humans Art Direction & Historical References

Implementation handoff · September 6, 2026 · `Brugoks/miqra-kodesh`

## 1. Character Lineup & Demographic Diversity

Rather than a single uniform character model or arbitrary palette-swaps, the character system represents authentic historical Levant demographics of the 1st century CE:

- **Adult Working Figures (Capernaum)**:
  - Galilean fisherman: Sun-weathered complexion, trimmed Levantine beard, rolled-up sleeve tunic (*haluk*), waist sash (*ezor*), bare-legged with leather sandals (*sandalim*).
  - Courtyard mill grinder: Seated posture, domestic woolen tunic, draped *sudarium* headcloth protecting from stone flour dust.
  - Water/cargo carrier: Sturdy physique, leather shoulder guard for water-skin (*nod*), dynamic walking posture.
- **Caesarea Maritima Roles**:
  - Roman/Hellenistic merchants and port workers: Togas/chitons with Roman-style clavi bands, shaven or trimmed styles.
- **Second Temple Courtyard Roles**:
  - Pilgrims and worshippers: Festal undyed wool *tallit* mantles, fringed borders (*tzitzit*), respectful upright and bowed stances.
- **Tabernacle Camp Roles**:
  - Ancient Bronze/Iron Age Levantine nomadic attire: Coarser spun linen and sheep's wool garments, desert headcloths.

## 2. Archaeological Sources & Textile Evidence

1. **Cave of Letters (Wadi Murabba'at & Nahal Hever)**:
   - Excavations by Yigael Yadin (1960–1961) revealed intact 1st–2nd century CE Judean tunics and mantles.
   - Tunics were woven in one piece from unbleached wool or linen, featuring two vertical purple/madder stripes (*clavi*).
   - Draped mantles (*tallit* / *himation*) were rectangular with notched gamma patterns at corners.
2. **Masada Footwear Excavations**:
   - Sandal remains from the Roman siege level (73 CE) demonstrate multi-layered leather soles fastened with leather thongs laced through punched perimeter loops and knotted between the first and second toes.
3. **Bar Kokhba Letters**:
   - Primary documentation of woven palm baskets, leather water-skins, and daily household utensils.

## 3. Material Look-Development Specifications

- **Skin**:
  - True dielectric: `metalness = 0.0`.
  - Micro-roughness: 0.60–0.78 with slight specular shine on brow, nasal ridge, and inner corners of eyelids.
  - No baked directional lighting; subtle AO confined to ear folds, nostrils, and between lips.
- **Garments**:
  - Heavy wool / woven linen: High roughness (0.85–0.95), subtle sheen angle for grazing rim light, sculpted primary folds representing gravity and waist tension.
- **Eyes**:
  - Wet corneal highlight: High gloss, depth from recessed iris plane behind clear cornea.
- **Hair / Beards**:
  - Alpha-tested cards: Cutout opacity with directional flow maps; soft shadow bias to prevent dark rectangular silhouette projection.
