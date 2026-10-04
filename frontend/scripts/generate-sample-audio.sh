#!/usr/bin/env bash
# Generates the synthetic, copyright-free sample tracks used by the dev-only
# "Load sample library" action. Requires FFmpeg. Output: assets/samples/*.mp3
set -euo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/assets/samples"
mkdir -p "$OUT"
DURATION=30

# name|title|creator|chord frequencies (Hz)
TRACKS=(
  "sample-1|Crimson Sunrise|AudioVault Demo|261.63 329.63 392.00"
  "sample-2|Night Drive|AudioVault Demo|220.00 261.63 329.63"
  "sample-3|Static Bloom|Synth Lab|196.00 246.94 293.66"
  "sample-4|Low Orbit|Synth Lab|146.83 220.00 277.18"
)

for track in "${TRACKS[@]}"; do
  IFS='|' read -r name title creator freqs <<< "$track"
  inputs=()
  for f in $freqs; do
    inputs+=(-f lavfi -i "sine=frequency=${f}:duration=${DURATION}")
  done
  count=$(wc -w <<< "$freqs" | tr -d ' ')
  ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" \
    -filter_complex "amix=inputs=${count}:normalize=1,tremolo=f=2:d=0.4,afade=t=in:d=2,afade=t=out:st=$((DURATION - 3)):d=3,volume=0.6" \
    -ac 1 -ar 44100 -b:a 64k \
    -metadata title="$title" -metadata artist="$creator" \
    "$OUT/${name}.mp3"
  echo "generated ${name}.mp3 (${title})"
done
