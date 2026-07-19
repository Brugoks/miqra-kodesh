#!/usr/bin/env bash
# Turn a raw AI-generated clip into a seamless looping wiki animation and
# publish it: forward-playing crossfade loop (the last second dissolves into
# the first, so motion never reverses and the seam is invisible), full frame
# at 720p (--square center-crops to 1:1), H.264 MP4, upload to R2 at
# _default/anim/<slug>.mp4, and register the slug in
# src/assets/wiki-animations.json so WikiEntryImage renders it.
#
# Usage:
#   ./scripts/anim-pilot/process-and-upload.sh <slug> <input-video> [--square] [--boomerang]
#   e.g. ./scripts/anim-pilot/process-and-upload.sh moses_2108 ~/Downloads/moses.mp4
#   --boomerang: forward+reversed loop instead of the crossfade (for clips
#   whose start and end differ too much for a clean dissolve)
#
# Requires R2_* vars in .env (already present) and ffmpeg — uses the system
# one, or the ffmpeg-static devDependency, or FFMPEG_BIN.
set -euo pipefail
cd "$(dirname "$0")/../.."

SLUG="${1:?usage: process-and-upload.sh <slug> <input-video> [--square] [--boomerang]}"
INPUT="${2:?usage: process-and-upload.sh <slug> <input-video> [--square] [--boomerang]}"
shift 2
CROP="full"; MODE="xfade"
for arg in "$@"; do
  case "$arg" in
    --square) CROP="--square" ;;
    --boomerang) MODE="boomerang" ;;
  esac
done

set -a; source .env; set +a
: "${R2_ACCESS_KEY_ID:?missing in .env}" "${R2_SECRET_ACCESS_KEY:?missing in .env}" "${R2_BUCKET:?missing in .env}"
R2_ENDPOINT="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"

FFMPEG="${FFMPEG_BIN:-$(command -v ffmpeg || node -p "require('ffmpeg-static')" 2>/dev/null || true)}"
[ -x "$FFMPEG" ] || { echo "ffmpeg not found — npm i -D ffmpeg-static, or set FFMPEG_BIN"; exit 1; }

OUT_DIR="scripts/anim-pilot/out"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/${SLUG}.mp4"

# Full frame by default — AI clips often widen the scene beyond the square
# still, and cropping loses it. --square center-crops to 1:1 when wanted.
if [ "$CROP" = "--square" ]; then
  VF="crop='min(iw,ih)':'min(iw,ih)',scale=720:720"
else
  VF="scale=-2:720"
fi

# Veo clips carry ambient audio; keep it (Character Reels plays it, wiki entry
# pages stay muted). The boomerang stays silent — reversed audio is jarring.
HAS_AUDIO=$({ "$FFMPEG" -i "$INPUT" 2>&1 || true; } | grep -c "Audio:" || true)
AUDIO_ARGS=(-an)

if [ "$MODE" = "boomerang" ]; then
  # Forward then reversed → motion returns to the first frame.
  FILTER="[0:v]${VF},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1,fps=24[v]"
else
  # Crossfade loop: play from FADE..end while the final FADE seconds dissolve
  # into the clip's first FADE seconds — forward-only motion, invisible seam.
  FADE=1
  # ffmpeg -i with no output exits non-zero by design; don't let -e kill us.
  DUR=$({ "$FFMPEG" -i "$INPUT" 2>&1 || true; } | sed -n 's/.*Duration: \([0-9:.]*\),.*/\1/p' \
    | awk -F: '{ print ($1*3600)+($2*60)+$3 }')
  [ -n "$DUR" ] || { echo "could not read clip duration"; exit 1; }
  OFFSET=$(awk -v d="$DUR" -v f="$FADE" 'BEGIN { printf "%.3f", d - 2*f }')
  FILTER="[0:v]${VF},fps=24,split[body][pre];[pre]trim=start=0:end=${FADE},setpts=PTS-STARTPTS[head];[body]trim=start=${FADE},setpts=PTS-STARTPTS[main];[main][head]xfade=transition=fade:duration=${FADE}:offset=${OFFSET}[v]"
  if [ "$HAS_AUDIO" -gt 0 ]; then
    # Same seam treatment for the soundtrack: the tail acrossfades into the
    # head, so the audio loop lands exactly on the video's (D−F) duration.
    FILTER="${FILTER};[0:a]asplit[abody][apre];[apre]atrim=start=0:end=${FADE},asetpts=PTS-STARTPTS[ahead];[abody]atrim=start=${FADE},asetpts=PTS-STARTPTS[amain];[amain][ahead]acrossfade=d=${FADE}[a]"
    AUDIO_ARGS=(-map "[a]" -c:a aac -b:a 128k)
  fi
fi

# yuv420p + faststart for web playback.
"$FFMPEG" -y -i "$INPUT" -filter_complex "$FILTER" \
  -map "[v]" "${AUDIO_ARGS[@]}" -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart \
  "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "encoded $OUT ($SIZE)"

KEY="_default/anim/${SLUG}.mp4"
curl -sf --aws-sigv4 "aws:amz:auto:s3" --user "$R2_ACCESS_KEY_ID:$R2_SECRET_ACCESS_KEY" \
  -X PUT -H "Content-Type: video/mp4" --data-binary "@$OUT" \
  "$R2_ENDPOINT/$R2_BUCKET/$KEY"
echo "uploaded → $KEY"

# Poster = the loop's own first frame, so the page shows the animation's
# opening frame while the video buffers and playback starts without a
# visible swap (the square still differs in content and aspect).
POSTER="$OUT_DIR/${SLUG}.jpg"
"$FFMPEG" -y -loglevel error -i "$OUT" -frames:v 1 -q:v 3 "$POSTER"
curl -sf --aws-sigv4 "aws:amz:auto:s3" --user "$R2_ACCESS_KEY_ID:$R2_SECRET_ACCESS_KEY" \
  -X PUT -H "Content-Type: image/jpeg" --data-binary "@$POSTER" \
  "$R2_ENDPOINT/$R2_BUCKET/_default/anim/${SLUG}.jpg"
echo "uploaded → _default/anim/${SLUG}.jpg (poster)"

# Manifest maps slug → content hash; the app appends ?v=<hash> so the CDN and
# browser caches never serve a stale clip after a re-upload.
node -e "
  const fs = require('fs'), crypto = require('crypto');
  const p = 'src/assets/wiki-animations.json';
  let cur = {};
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    cur = Array.isArray(j) ? Object.fromEntries(j.map((s) => [s, '0'])) : j;
  } catch { /* fresh file */ }
  cur['$SLUG'] = crypto.createHash('md5').update(fs.readFileSync('$OUT')).digest('hex').slice(0, 8);
  fs.writeFileSync(p, JSON.stringify(Object.fromEntries(Object.entries(cur).sort()), null, 2) + '\n');
"
echo "registered $SLUG in src/assets/wiki-animations.json"
echo ""
echo "Preview: ${VITE_WIKI_IMAGE_BASE_URL:-https://wiki-images.miqra-kodesh.com}/$KEY"
echo "Next: npm run dev → /wiki/$SLUG to review, then commit + deploy."
