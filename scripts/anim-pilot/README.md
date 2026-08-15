# Wiki character animation pilot

Goal: a looping ambient animation for a primary character, generated from the
existing still so the art style stays consistent.

## 1. Generate the clip in the Gemini App

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
- **5–10 seconds** works well; the pipeline turns it into a forward-playing
  loop whose last second crossfades into its first (no reversed motion).
- Any resolution/aspect is fine — the pipeline keeps the full frame at 720p,
  so nothing from the scene is lost. Pass `--square` to center-crop to 1:1.
- Motion should be *ambient* (wind, dust, light) so the crossfade seam
  dissolves cleanly. If a clip's start and end differ too much, re-run with
  `--boomerang` for a forward+reversed loop instead.

### Subscription-quota browser queue

The Google AI subscription's three daily generations belong to the Gemini App,
not the Gemini API. `gemini-app-queue.js` stages up to three local upload files
and keeps browser automation resumable without accidentally submitting a job
twice.

Prepare a manifest containing `slug`, `name`, `image`, and the final motion
`prompt`, then run:

```sh
node scripts/anim-pilot/gemini-app-queue.js prepare --manifest /path/to/jobs.json
node scripts/anim-pilot/gemini-app-queue.js next
```

For each item, browser automation uploads the printed image and prompt to
Gemini's Videos view. Mark it immediately after submission, then attach the
downloaded clip:

```sh
node scripts/anim-pilot/gemini-app-queue.js mark <slug> submitted
node scripts/anim-pilot/gemini-app-queue.js attach <slug> ~/Downloads/<clip>.mp4
```

After visual review, publish every completed download:

```sh
node scripts/anim-pilot/gemini-app-queue.js publish-ready
```

The `image` field may be a local generated PNG/JPG or an HTTPS URL. If omitted,
the queue stages the existing `_default/<slug>.jpg` Wiki image from R2.

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

Audio: the clip's ambient soundtrack is kept and gets the same crossfade seam
(Character Reels plays it after a tap on the sound toggle; wiki entry pages
stay muted). `--boomerang` clips are published silent — reversed audio jars.
