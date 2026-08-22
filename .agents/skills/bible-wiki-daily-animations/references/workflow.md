# Daily workflow

All commands run from the Miqra Kodesh repository root.

## 1. Synchronize and inspect

1. Require a clean worktree or preserve unrelated user changes.
2. Fast-forward the current branch from its configured GitHub upstream.
3. Read `scripts/anim-pilot/README.md`, `src/assets/wiki-animations.json`, `src/assets/bible-wiki.json`, `src/assets/bible-wiki-extended.json`, `src/assets/bible-wiki-curated.json`, and `src/lib/characterIconography.js` as needed.
4. Treat `src/assets/wiki-animations.json` as the app registry, then verify absence with `https://wiki-images.miqra-kodesh.com/_default/anim/<slug>.mp4`. A 404 means the public R2 object is absent.

## 2. Select no more than three people

Choose important, recognizable people lacking animation. Prefer:

- canonical prominence and usefulness to readers;
- a distinct scene recognizable without a caption;
- iconography grounded in a named passage;
- variety across scenes, eras, genders, palette, and motion;
- people with a valid default Wiki entry and no theological reason to suppress generated depiction.

Do not select `god_1324`, `holy_spirit_7400`, or `jesus_905` through this workflow. Do not treat verse-count alone as importance: tribal/national names can rank highly while offering a weaker character portrait.

## 3. Create source stills

Use one built-in image-generation call per person. Save final PNGs under `scripts/anim-pilot/daily-sources/YYYY-MM-DD/<slug>.png`.

Use a vertical 2:3 portrait. Specify the biblical passage, one primary subject, Semitic/Middle Eastern features where applicable, plausible period dress/architecture/ecology, a clear silhouette, safe crop margins, and natural elements suitable for ambient motion. Keep violence non-graphic and nudity modest. Inspect every image before queueing it.

## 4. Prepare the resumable queue

Create a manifest with one item per person containing `slug`, `name`, `image`, and `prompt`, then run:

```sh
node scripts/anim-pilot/gemini-app-queue.js prepare --manifest <manifest>
node scripts/anim-pilot/gemini-app-queue.js next
```

The queue refuses more than three items and refuses already registered slugs by default. Motion prompts must preserve the exact still, identity, composition, costume, and painterly style. Use scene-appropriate character action when it improves the moment—gestures, gaze changes, bracing, walking, or interaction with an existing prop—while arranging the action to return near its opening state. Pair it with environmental motion, a locked camera, no cuts/zoom/pan, no unrequested objects or identity/anatomy morphing, and 6–8 seconds. Do not make every figure merely blink and breathe.

## 5. Generate in a fresh Gemini conversation using Chrome

Use the user's connected Chrome session and open a new Gemini conversation. Select the Videos/image-to-video flow that uses Veo. For the next queued item, upload its `stagedImage`, paste its prompt exactly, and inspect the visible UI immediately before submitting.

Submit once. As soon as the UI confirms submission, run:

```sh
node scripts/anim-pilot/gemini-app-queue.js mark <slug> submitted
```

Wait for completion, download the MP4 into the user's Downloads folder, and attach it:

```sh
node scripts/anim-pilot/gemini-app-queue.js attach <slug> <absolute-downloaded-mp4>
```

Repeat in the same new conversation until the daily queue is exhausted. Never infer that a click failed and click again without checking Gemini's visible job state and the local queue.

## 6. Review and publish

Inspect each downloaded clip for identity drift, extra limbs/objects, unintended camera motion/cuts, inappropriate content, unreadable scene changes, and loop suitability. Reject failures rather than uploading them.

Publish accepted clips individually so a failure cannot obscure which slug changed:

```sh
node scripts/anim-pilot/gemini-app-queue.js publish <slug>
```

The publisher creates a forward crossfade loop, keeps suitable audio, encodes H.264 at 720p, uploads `_default/anim/<slug>.mp4` and its poster JPG to R2, and writes the clip hash to `src/assets/wiki-animations.json`. Use `--boomerang` only when the crossfade visibly fails; it intentionally removes audio.

## 7. Verify and report

Verify both public objects return HTTP 200:

- `https://wiki-images.miqra-kodesh.com/_default/anim/<slug>.mp4`
- `https://wiki-images.miqra-kodesh.com/_default/anim/<slug>.jpg`

Run relevant tests/build, then review `/wiki/<slug>` locally. Record selected passages, saved source paths, Gemini outcomes, R2 keys, manifest changes, verification results, and any rejected/unspent generation before publishing the Git changes.

## 8. Commit, synchronize, and push `main`

Only continue after every accepted clip is published and the relevant checks pass.

1. Confirm the current branch is `main`. If it is not, stop and ask before moving or replaying commits.
2. Inspect `git status`, the unstaged diff, and the staged diff.
3. Stage explicit workflow-owned paths only. These can include the skill files, intentionally changed automation scripts, approved daily source images and their job manifest, and `src/assets/wiki-animations.json`.
4. Exclude unrelated user changes and transient artifacts such as Gemini queue files, browser downloads, `out/`, and `review/`.
5. Create one concise batch commit, for example `feat(wiki): add daily character animations`.
6. Run `git fetch origin main`. If `origin/main` advanced, rebase the new local commit onto it. Stop and report any conflict; do not discard or overwrite either side.
7. Push with `git push origin main`. Never force-push.
8. Verify that local `HEAD` matches `origin/main` and report the commit hash and final worktree status.
