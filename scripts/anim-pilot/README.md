# Wiki character animation pilot

Goal: a looping ambient animation for a primary character, generated from the
existing still so the art style stays consistent.

## 1. Generate the clip in Antigravity

Feed it the source still in this folder (e.g. `moses_2108-source.jpg`) with an
image-to-video model (Veo) and a prompt like:

> Animate this exact image with subtle looping ambient motion. Keep the
> composition, character, and art style unchanged. The prophet's robes and
> beard drift gently in a desert wind, sand and dust motes float through the
> air, clouds behind him move slowly, warm light shimmers softly on his face.
> Camera completely locked — no zoom, no pan, no cuts. Slow, majestic,
> continuous motion throughout. 5 seconds.

Settings that matter:
- **Camera locked / no cuts** — cuts and zooms ruin the loop.
- **5 seconds** is plenty; the pipeline doubles it into a ~10s boomerang loop.
- Any resolution/aspect is fine — the pipeline center-crops to square (720×720)
  to match the wiki stills. Pass `--no-crop` to keep the source aspect.
- Motion should be *ambient* (wind, dust, light), not action — ambient motion
  boomerangs invisibly; a walking character visibly reverses.

## 2. Process + publish

```sh
./scripts/anim-pilot/process-and-upload.sh moses_2108 ~/Downloads/<clip>.mp4
```

This loops it, uploads to R2 (`_default/anim/moses_2108.mp4`), and registers
the slug in `src/assets/wiki-animations.json`. Review at `/wiki/moses_2108`
(npm run dev), then commit the json change and deploy.

Notes: org-uploaded pictures still take priority over animations; users with
"reduce motion" enabled keep the static still; if the video 404s or fails, the
page falls back to the JPG automatically.
