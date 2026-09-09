# Tabernacle character clothing

The Tabernacle now has five dedicated textured, skinned character assets: an Israelite camp man and woman, a Levite attendant, an Aaronic priest, and a high priest. They replace the shared Galilean clothing in the nearby character pool. Distant figures retain the existing inexpensive crowd geometry; role-specific garment colors distinguish attendants, priests and the high priest at that distance.

## Clothing and evidence

- **Camp:** plain earth-tone woven tunics with continuous long skirts and fabric waist sashes. These are plausible costume reconstructions, not a prescribed wilderness uniform.
- **Levite attendants:** simple undyed garments, sash and cloth headwrap. Levites assist and guard; Aaron's descendants serve as priests. The four attendant placements are outside the court, away from the altar and sanctuary furnishings. Their precise dress is an art choice, not a distinct uniform prescribed in Numbers 18:1–7.
- **Aaronic priests:** light linen tunics, long sleeves, closed skirts, sashes and linen headcoverings, following Exodus 28:40–43. The visible garment cut and wrapping pattern are interpretive. Hidden linen undergarments are not separately modeled.
- **High priest:** linen tunic and headwrap, blue outer robe, multicolor woven ephod with a matching band and shoulder straps, two onyx shoulder stones in gold settings, a square breastpiece with twelve individually modeled stones in four rows of three, gold cords and blue fastenings, and alternating gold bells and colored yarn pomegranates at the hem. The forehead plate has the Hebrew inscription “Holy to the LORD.” The arrangement follows Exodus 28 and 39. The illustration uses twelve bells and twelve pomegranates; the text does not specify those counts. Tribe-name micro-engraving and the concealed Urim and Thummim are not modeled. Modern gemstone colors/identifications, faces, heights, exact tailoring and inscription letter forms are not verified historical details.

This depicts ordinary ministry vestments outside the tent. It does not put the high priest behind the veil wearing the ephod: Leviticus 16:4 specifies a different linen outfit for that rite. The new **The High Priest** viewpoint and the garment/Levite hotspots explain these distinctions with Scripture references.

Sources: [Exodus 28](https://www.esv.org/Exodus+28/), [Numbers 18](https://www.esv.org/Numbers+18/), [Leviticus 16](https://bible.usccb.org/bible/leviticus/16).

## Authoring and rights

The same pinned CC0 MakeHuman/MPFB anatomy and fitted tunic sources used by the existing scene characters provide the base meshes. See [scene-humans-assets.md](scene-humans-assets.md); source notices are also copied into `public/assets/scenes/tabernacle/notices/`. The new cloth, sleeves, closed skirt, ephod, turban, stones, settings and hem ornaments are authored geometry with embedded material textures. The modern Hebrew inscription is converted to mesh using a locally installed font; no font file is shipped. Faces and costume details are artist's reconstructions, not scans.

`build_tabernacle_characters.py` reuses the existing authoring utilities without rebuilding or changing Elah or the shared character library. Editable Blender scenes, raw GLBs and studio previews are kept in ignored `scripts/.cache/tabernacle/`. The export normalizes sole-to-crown anatomy to 1.70 m / 1.62 m for the camp man/woman, 1.73 m for the attendant, 1.72 m for the priest and 1.75 m for the high priest. Headwear is additional. These are scene design choices.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/humans/build_tabernacle_characters.py -- \
  --source /tmp/miqra-human-assets --mpfb /tmp/miqra-mpfb --preview
node scripts/humans/package_tabernacle_characters.mjs
node scripts/validate-tabernacle-characters.js
node scripts/validate-scene-assets.js
```

Use `--only high-priest` (or another role id) for a single asset rebuild. Substitute actual source-cache paths on other machines. Inscription mesh generation uses `/System/Library/Fonts/Supplemental/Arial Unicode.ttf` when available; another machine needs that path or an explicitly chosen Hebrew-capable font for that detail.

## Runtime

The Tabernacle actor group loads only these five models; the other scenes retain their existing human libraries. Explicit figure variants now take precedence over the generic crowd rotation, fixing the previous case where a supposed priest could receive ordinary Galilean clothing. The former camp-dweller fallback was incorrectly bound to the first altar priest; it now identifies a camp figure.

The models retain the existing six baked skeletal clips. Current placements use standing, work and prayer activities appropriate to the available robes; a dedicated cloth simulation or kneeling garment rig is not provided. Covered leg skin is masked beneath the robes to prevent animation poke-through, while exposed feet remain intact. The high priest uses a restrained idle outside the tent. All costumes include both LODs, and the breastpiece/role silhouette remains present on low quality. The existing nearby actor limit, fallback suppression, reduced-motion behavior, pose safety, collision and skeleton disposal remain in use. Explicitly tagged gold materials preserve their metalness; ordinary skin and cloth remain dielectric.

## Verification

`tabernacleCharacters.test.js` parses the actual GLBs and verifies role assignments, distinctive vestment counts, low-quality high-priest visibility, gold preservation, scene-specific loading and the inspection viewpoint. Existing crowd, material, asset, Tabernacle construction and navigation tests exercise the shared integration. The dedicated validator decodes embedded textures, checks content hashes, skin weights, triangles, LODs and clip availability. Studio previews and the live browser scene are inspected for garment fit. These checks do not establish historical portrait accuracy or a measured mobile frame-rate target.

Final validation: 71 targeted tests passed across six files; both asset validators, ESLint, Python compilation and the production build passed. The build retains the existing large-chunk advisory.
