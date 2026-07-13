#!/bin/zsh
# Daily driver for the Bible Wiki default-image backfill. Run by cron once a day
# because the Cloudflare Workers-AI free tier caps at 10,000 neurons/day
# (~70 images), so the full ~4,400-image backlog takes weeks. Every script here
# is idempotent and resumable: it skips images that already exist and bails once
# the daily quota is spent, so re-running simply continues where it left off.
#
# Priority order — finish the small, high-value sets first, then the long tail:
#   1. Church-History creeds/confessions (6)
#   2. Bible events / Timeline (~450)
#   3. Extended wiki long tail (~3,900)
#
# Install: crontab entry runs this daily. Remove it with `crontab -e` to stop.
# Progress: tail -f ~/wiki-image-gen.log
# One-off manual run: zsh scripts/generate-wiki-images-daily.sh

set -u
REPO="/Users/markquiambao/GitHub/miqra-kodesh"
NODE="/Users/markquiambao/.local/node-v24.14.1-darwin-arm64/bin/node"
LOG="$HOME/wiki-image-gen.log"

cd "$REPO" || exit 1

echo "===== $(date) — daily wiki image run start =====" >>"$LOG"
"$NODE" scripts/generate-wiki-extras-images.js --creeds  >>"$LOG" 2>&1
"$NODE" scripts/generate-wiki-extras-images.js --events  >>"$LOG" 2>&1
"$NODE" scripts/generate-extended-wiki-images.js         >>"$LOG" 2>&1
echo "===== $(date) — daily wiki image run end =====" >>"$LOG"
