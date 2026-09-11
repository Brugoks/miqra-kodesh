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
node scripts/humans/retarget_tabernacle_mixamo.mjs
node scripts/humans/package_tabernacle_characters.mjs
node scripts/validate-tabernacle-characters.js
node scripts/validate-scene-assets.js
```

Use `--only high-priest` (or another role id) for a single asset rebuild. Substitute actual source-cache paths on other machines. Inscription mesh generation uses `/System/Library/Fonts/Supplemental/Arial Unicode.ttf` when available; another machine needs that path or an explicitly chosen Hebrew-capable font for that detail.

## Runtime

The Tabernacle actor group loads only these five models; the other scenes retain their existing human libraries. Explicit figure variants now take precedence over the generic crowd rotation, fixing the previous case where a supposed priest could receive ordinary Galilean clothing. The former camp-dweller fallback was incorrectly bound to the first altar priest; it now identifies a camp figure.

The models retain the existing six baked skeletal clips and now include target-bound Adobe Mixamo captures. Current placements use standing, work and prayer activities appropriate to the available robes; a dedicated cloth simulation or kneeling garment rig is not provided. Covered leg skin is masked beneath the robes to prevent animation poke-through, while exposed feet remain intact. The high priest uses a restrained idle outside the tent. All costumes include both LODs, and the breastpiece/role silhouette remains present on low quality. The existing nearby actor limit, fallback suppression, reduced-motion behavior, pose safety, collision and skeleton disposal remain in use. Explicitly tagged gold materials preserve their metalness; ordinary skin and cloth remain dielectric.

## Verification

`tabernacleCharacters.test.js` parses the actual GLBs and verifies role assignments, distinctive vestment counts, low-quality high-priest visibility, gold preservation, scene-specific loading and the inspection viewpoint. Existing crowd, material, asset, Tabernacle construction and navigation tests exercise the shared integration. The dedicated validator decodes embedded textures, checks content hashes, skin weights, triangles, LODs and clip availability. Studio previews and the live browser scene are inspected for garment fit. These checks do not establish historical portrait accuracy or a measured mobile frame-rate target.

## Mixamo ambient routines

The user supplied Idle, Walking, Talking and Talking (1), plus the Farming Pack. Selected pack captures are `holding walk`, `holding idle` and `watering`. Planting, milking, kneeling and wheelbarrow clips are not used in this stationary wilderness camp. Raw donor FBXs stay in ignored `scripts/.cache/tabernacle/mixamo/`; no donor mesh is shipped.

- The high priest uses the restrained Idle capture outside the tent.
- One priest carries a tied wood bundle along the altar's outer service lane. Another performs a project-authored hand-washing gesture at the laver; that gesture is interpretive and does not depict the complete hands-and-feet washing prescription.
- Two Levites keep watch near the entrance; two walk short routes outside the side hangings.
- Two camp dwellers carry woven baskets, one pours from a clay jar into a basin with pauses, and two pairs take turns speaking using the two Talking captures. Remaining onlookers use the relaxed idle. The camp is capped at nine people to preserve clear task lanes.
- The **Camp Life** viewpoint provides a close view of the water task. Routes and task locations are illustrative. Carry routes currently retain their loads during endpoint pauses; pickup/deposit transactions are not simulated.

The offline retargeter preserves donor body motion, converts orientation through each target's reference pose, grounds the soles, removes travelling root translation, and measures each walking cycle's actual displacement. Basket and wood grips use target-specific arm IK so palms remain separated around the load; neutral finger curls replace donor finger rotations. The fitted source skirt and continuous skirt share a limited amount of thigh motion with the pelvis. This is skeletal cloth deformation, not fabric simulation.

The runtime keeps actor translation and yaw on scene-owned routes, synchronizes gait to travelled distance, alternates conversation windows, and pauses pouring between repetitions. Props follow hand landmarks. Water is visible only while the mouth of the tipped jar is above the basin. Reduced motion freezes routes and poses and hides the stream. The Tabernacle's nearby model budget is 14 / 22 / 28 on low / balanced / high; low still uses the reduced mesh LOD. Other scenes retain their existing budgets and animation behavior.

**Rights:** character geometry remains CC0; embedded captures are Adobe Mixamo assets, not CC0. The manifest and model metadata identify this combination as `CC0 + Adobe Mixamo`, with separate geometry/animation fields. Adobe's [Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) describes permitted project use. Each embedded capture records its source FBX hash, raw target bind-model hash, source title, frame rate and original duration; walking clips also record metres per cycle. The retargeter writes separate `*-animated.glb` intermediates so rerunning it does not accumulate animation buffers in the authoring originals.

`tabernacleLife.test.js` checks actual animated skeletons throughout each selected clip, source metadata, loop seams, hand separation and prop contact, unobstructed routes and role boundaries, paired conversation turns, reduced motion and disposal. Live scene and isolated-rig previews complement those numerical checks.

Final motion validation: 84 targeted tests passed across eight files; both asset validators, ESLint, Python compilation and the production build passed. Live Camp Life, Laver and High Priest views and isolated idle/carry/washing poses were inspected. The build retains the existing large-chunk advisory.
