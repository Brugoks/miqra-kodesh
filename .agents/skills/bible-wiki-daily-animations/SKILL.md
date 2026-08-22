---
name: bible-wiki-daily-animations
description: Create, publish, commit, and push up to three daily Gemini/Veo ambient loops for important Bible Wiki people that do not yet have R2 animations. Use for the Miqra Kodesh Bible Wiki animation quota workflow; do not use to replace existing animations unless the user explicitly requests regeneration.
---

# Bible Wiki Daily Animations

Create a coherent daily batch of at most three new character animations. Read [references/workflow.md](references/workflow.md) before acting.

## Outcome

For each selected person:

- confirm the animation is absent both from `src/assets/wiki-animations.json` and the public R2 object URL;
- create a culturally and biblically grounded 2:3 portrait source still with an iconic, character-specific scene;
- use the signed-in Gemini App in Chrome to generate one image-to-video Veo loop;
- download, visually review, process, upload, and register the accepted clip;
- verify the public MP4/poster and the app route; and
- commit only workflow-owned changes, synchronize with `origin/main`, and push `main`.

Use the built-in image generation tool for source stills and Chrome browser control for Gemini. Reuse the repository's queue and publishing scripts instead of reimplementing quota tracking, video processing, R2 signing, or manifest mutation.

## Safety and stopping rules

- Treat each Gemini submission as one scarce daily generation. Never submit the same queued item twice unless the user explicitly approves consuming another generation.
- Never use `--force` to select or replace an already animated figure without explicit authorization.
- Publishing mutates R2 and `wiki-animations.json`; confirm the downloaded clip belongs to the queued slug and passes visual review first.
- If Chrome is not connected or Gemini is not signed in, stop before submission and ask the user to connect/sign in.
- If a generation fails, is unsafe, introduces anachronisms, changes identity/composition, or cannot loop cleanly, mark it rejected and do not publish it.
- Do not depict God as a human figure. Avoid halos, devotional stereotypes unsupported by the text, European medieval costuming, sexualized nudity, graphic violence, text, and watermarks.
- Before committing, inspect the worktree and diffs and stage explicit paths only. Never include unrelated user changes, Gemini queue/download files, rendered outputs, or review intermediates.
- Never force-push. If `origin/main` cannot be integrated cleanly, stop and report the conflict instead of overwriting remote work.
