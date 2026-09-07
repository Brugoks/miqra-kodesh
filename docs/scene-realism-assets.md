# Biblical Scene Realism — Asset Catalog & Provenance Register

This document specifies the technical parameters, file formats, provenance, licenses, and packaging conventions for assets deployed in `miqra-kodesh`.

## Asset Packaging & Runtime Standards

- **Runtime Path**: `public/assets/scenes/<site-or-shared>/[name]-[hash].[ext]`
- **Cache Contract**: Cache-first via Service Worker `/assets/*` match; immutable content-addressed naming.
- **Transform Conventions**:
  - Distance: Meters.
  - Up Axis: +Y up.
  - Forward Axis: -Z forward in authoring; transformed to scene compass axes at placement.
  - Pivot Point: Ground contact / base center for upright props; waterline for boats.
- **PBR Texture Standards**:
  - Albedo / Base Color: sRGB color space (`THREE.SRGBColorSpace`).
  - Normal, Roughness, Metalness, Ambient Occlusion: Data maps in Linear color space.
  - Resolution: Hero close-ups ≤ 2048², standard environment ≤ 1024², prop accents ≤ 512².

---

## Capernaum Pilot Asset Inventory

### 1. PBR Surface Materials (`/public/assets/scenes/capernaum/materials/`)

| Asset ID | Format | Maps Provided | Base Metric Scale | License / Provenance |
| :--- | :--- | :--- | :--- | :--- |
| `mat-basalt-fieldstone` | PNG/WebP | Diffuse, Normal, Roughness, AO | 2.0 m × 2.0 m | CC0 / Original procedural synthesis based on SBF field documentation |
| `mat-packed-earth` | PNG/WebP | Diffuse, Normal, Roughness, AO | 3.0 m × 3.0 m | CC0 / Public Domain surface scan reference |
| `mat-weathered-timber` | PNG/WebP | Diffuse, Normal, Roughness, AO | 1.0 m × 4.0 m | CC0 / Curated texture generation |
| `mat-reed-thatch` | PNG/WebP | Diffuse, Normal, Roughness, AO | 1.5 m × 1.5 m | CC0 / Procedural thatch generator |
| `mat-coarse-linen` | PNG/WebP | Diffuse, Normal, Roughness | 1.0 m × 1.0 m | CC0 / Textile reference |

### 2. 3D Architectural & Marine Models (`/public/assets/scenes/capernaum/models/`)

| Asset ID | Format | Primitives / Nodes | LOD Levels | Historical Source | License |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `model-ginosar-boat` | GLB | Hull planks, ribs, keel, steering oar, thwarts | High (hero shore), Low (distance) | `CAP-BOAT-GINOSAR-01` (Wachsmann 1995) | CC-BY-4.0 / Miqra Kodesh 3D project |
| `model-domestic-doorway` | GLB | Basalt lintel, jambs, threshold, timber pivot | High (near view) | `CAP-ARCH-INSULA-01` (Corbo 1975) | CC0 / Original authored mesh |
| `model-galilee-ridge` | GLB | Northern Galilean hill contour mesh | Single horizon LOD | `CAP-GEO-RIDGE-01` (Survey of Palestine) | CC0 / Elevation mesh synthesis |

### 3. Domestic & Fishing Props (`/public/assets/scenes/capernaum/props/`)

| Asset ID | Format | Description | Target Dimensions | License |
| :--- | :--- | :--- | :--- | :--- |
| `prop-galilean-jar` | GLB | Ribbed earthenware water/storage jar | 0.45 m dia × 0.70 m height | CC0 / Original |
| `prop-woven-basket` | GLB | Palm-frond open storage basket | 0.50 m dia × 0.35 m height | CC0 / Original |
| `prop-fish-net-drying` | GLB | Mesh net with visible openings on racks | 2.5 m width × 1.2 m height | CC0 / Original |
| `prop-stone-anchor` | GLB | Perforated basalt mooring stone with rope | 0.40 m × 0.30 m × 0.20 m | CC0 / Original |

### 4. Foreground Villagers (`/public/assets/scenes/capernaum/actors/`)

| Actor ID | Role | Attire & Props | Motion Clips | License |
| :--- | :--- | :--- | :--- | :--- |
| `actor-fisherman-mending` | Seated shore fisherman | Coarse undyed tunic, net shuttle | `idle-mend`, `inspect-net` | CC0 / Original procedural rig & poses |
| `actor-woman-grinding` | Courtyard worker | Deep blue/earth tunic, basalt mill | `grind-flour`, `rest-look` | CC0 / Original procedural rig & poses |
| `actor-bearer-walking` | Lane carrier | Tunic, headcloth, water skin | `carry-walk`, `pause-breathe` | CC0 / Original procedural rig & poses |

### 5. Recorded Environmental Audio (`/public/assets/scenes/shared/audio/` & `capernaum/audio/`)

| Audio Asset ID | File Format | Length | Audio Type | Acoustic Description | License |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `snd-galilee-water-lap` | OGG/WAV | 8.2 s loop | Positional / Bed | Freshwater lake lapping against basalt shingle | CC0 / Freesound public domain sample bank |
| `snd-reeds-breeze` | OGG/WAV | 11.5 s loop | Bed | Wind passing through lakeside reeds | CC0 / Freesound public domain sample bank |
| `snd-timber-creak` | OGG/WAV | 4.1 s loop | Positional | Moored boat timber flex and rope strain | CC0 / Freesound public domain sample bank |
| `snd-step-stone` | OGG/WAV | ~0.3 s one-shots | Distance-driven | Hard contact footstep on unpolished basalt | CC0 / Field sound recording |
| `snd-step-earth` | OGG/WAV | ~0.3 s one-shots | Distance-driven | Soft muffled footstep on packed village marl | CC0 / Field sound recording |
