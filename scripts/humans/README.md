# Character authoring

See [the asset and build guide](../../docs/scene-humans-assets.md).

1. `python3 scripts/humans/fetch_sources.py`
2. Run `build_characters.py` inside Blender with `--source` and `--mpfb` paths printed by the fetcher.
3. `node scripts/humans/package_characters.mjs`
4. `node scripts/validate-scene-humans.js`

The source fetcher deliberately fails if an upstream archive changes. Review its new contents and license before updating a pinned hash. MPFB code is used at authoring time and is not bundled in the application.
