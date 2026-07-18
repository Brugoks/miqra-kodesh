#!/usr/bin/env bash
# Turn a raw AI-generated clip into a seamless looping wiki animation and
# publish it: boomerang loop (forward + reversed), center-crop to square to
# match the character stills, H.264 MP4, upload to R2 at
# _default/anim/<slug>.mp4, and register the slug in
# src/assets/wiki-animations.json so WikiEntryImage renders it.
#
# Usage:
#   ./scripts/anim-pilot/process-and-upload.sh <slug> <input-video> [--no-crop]
#   e.g. ./scripts/anim-pilot/process-and-upload.sh moses_2108 ~/Downloads/moses.mp4
#
# Requires R2_* vars in .env (already present) and ffmpeg — uses the system
# one, or the ffmpeg-static devDependency, or FFMPEG_BIN.
set -euo pipefail
cd "$(dirname "$0")/../.."

SLUG="${1:?usage: process-and-upload.sh <slug> <input-video> [--no-crop]}"
INPUT="${2:?usage: process-and-upload.sh <slug> <input-video> [--no-crop]}"
CROP="${3:-crop}"

set -a; source .env; set +a
: "${R2_ACCESS_KEY_ID:?missing in .env}" "${R2_SECRET_ACCESS_KEY:?missing in .env}" "${R2_BUCKET:?missing in .env}"
R2_ENDPOINT="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"

FFMPEG="${FFMPEG_BIN:-$(command -v ffmpeg || node -p "require('ffmpeg-static')" 2>/dev/null || true)}"
[ -x "$FFMPEG" ] || { echo "ffmpeg not found — npm i -D ffmpeg-static, or set FFMPEG_BIN"; exit 1; }

OUT_DIR="scripts/anim-pilot/out"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/${SLUG}.mp4"

# Square center-crop matches the 1:1 character stills; --no-crop keeps source AR.
if [ "$CROP" = "--no-crop" ]; then
  VF="scale=-2:720"
else
  VF="crop='min(iw,ih)':'min(iw,ih)',scale=720:720"
fi

# Boomerang: forward then reversed → motion returns to the first frame, so the
# loop point is seamless. Strip audio; yuv420p + faststart for web playback.
"$FFMPEG" -y -i "$INPUT" -filter_complex \
  "[0:v]${VF},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1,fps=24[v]" \
  -map "[v]" -an -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart \
  "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "encoded $OUT ($SIZE)"

KEY="_default/anim/${SLUG}.mp4"
curl -sf --aws-sigv4 "aws:amz:auto:s3" --user "$R2_ACCESS_KEY_ID:$R2_SECRET_ACCESS_KEY" \
  -X PUT -H "Content-Type: video/mp4" --data-binary "@$OUT" \
  "$R2_ENDPOINT/$R2_BUCKET/$KEY"
echo "uploaded → $KEY"

node -e "
  const fs = require('fs');
  const p = 'src/assets/wiki-animations.json';
  const list = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!list.includes('$SLUG')) { list.push('$SLUG'); list.sort(); }
  fs.writeFileSync(p, JSON.stringify(list, null, 2) + '\n');
"
echo "registered $SLUG in src/assets/wiki-animations.json"
echo ""
echo "Preview: ${VITE_WIKI_IMAGE_BASE_URL:-https://wiki-images.miqra-kodesh.com}/$KEY"
echo "Next: npm run dev → /wiki/$SLUG to review, then commit + deploy."
