#!/usr/bin/env bash
# Publish every <slug>.mp4 in a folder through the standard animation pipeline.
set -euo pipefail
cd "$(dirname "$0")/../.."

CLIPS_DIR="${1:?usage: process-batch.sh <clips-folder> [--square] [--boomerang]}"
shift
[ -d "$CLIPS_DIR" ] || { echo "clips folder not found: $CLIPS_DIR"; exit 1; }

shopt -s nullglob
CLIPS=("$CLIPS_DIR"/*.mp4)
[ "${#CLIPS[@]}" -gt 0 ] || { echo "no .mp4 clips found in $CLIPS_DIR"; exit 1; }

for clip in "${CLIPS[@]}"; do
  slug="$(basename "$clip" .mp4)"
  ./scripts/anim-pilot/process-and-upload.sh "$slug" "$clip" "$@"
done
