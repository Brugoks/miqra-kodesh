# Character source notices

These GLBs derive from CC0 MakeHuman Community assets, including the core human mesh/targets/rig, system skins/eyes/hair/eyebrows, WDG's Mycenaean tunic from Dress 01, and grinsegold's Beard Sigmund from Bodyparts 05. Miqra Kodesh adds fitting, colors, animation, detail levels and packaging.

- https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html
- https://static.makehumancommunity.org/assets/assetpacks/dress01.html
- https://static.makehumancommunity.org/assets/assetpacks/bodyparts05.html
- https://github.com/makehumancommunity/mpfb2

The adjacent CC0 text and pack manifests document the asset licenses. MPFB's authoring code has a separate GPL license and is not included in these GLBs. Original core copyright holders at CC0 release include Data Collection AB, Joel Palmius and Jonas Hauquier.

The tunic's source mesh file retains an older AGPL header; the later distributed Dress 01 pack explicitly lists this asset as CC0. The full provenance explanation, pinned source hashes and rebuild instructions are in docs/scene-humans-assets.md in the project repository. These models are artistic background reconstructions, not verified portraits or costume replicas.

The Jesus tableau character reuses the listed anatomy, long01 hair, Sigmund beard and adapted tunic. Its red mantle geometry and woven texture are project-authored. Mixamo animations were consulted as visual pose references; these GLBs do not contain downloaded Mixamo motion capture. See `docs/scene-humans-assets.md` for the reference list and rebuild commands.

The identity presets (the `woman-*`, `man-*` and `child-*` characters) use further assets from the same three packs and the pinned MPFB commit, each listed CC0 in the adjacent pack manifests and in MPFB's `LICENSE.ASSETS.md`: the system skins (`young_caucasian_female`, `young_caucasian_female2`, `young_caucasian_male`, `young_caucasian_male2`, `middleage_caucasian_female`, `middleage_caucasian_male`, `old_caucasian_female`, `old_caucasian_male`), hair (`short01`, `short03`, `long01`, `braid01`), eyebrows (`eyebrow001`, `002`, `004`, `005`, `008`, `009`, `011`, `012`), eyes (`brown`, `brownlight`) and MPFB's face and body morph targets. Their beard, where they have one, is WDG's `wdg_scruffy_beard` from Bodyparts 05. As with the tunic, that beard's source mesh file retains an older AGPL header while the distributed Bodyparts 05 manifest explicitly lists it as CC0 (WDG, 2019); it is used under that later explicit release. The measured body and the exact morph targets and weights of each preset are in its manifest record (`scenePresetAssets.js`) and in the GLB's `asset.extras`. The faces are authored variation, not portraits of anyone and not evidence of what people looked like.

