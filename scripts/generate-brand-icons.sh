#!/usr/bin/env bash
# Export the checked-in reference-based artwork; requires ImageMagick 7 (magick).
set -euo pipefail
cd "$(dirname "$0")/.."
source_icon=branding/st-dumbbell-master.png
for size in 192 512; do
  magick "$source_icon" -resize "${size}x${size}" -background '#0B0810' -alpha remove -alpha off -strip "public/icon-st-v2-${size}.png"
  # Keep older icon URLs valid for existing manifest/shortcut caches.
  cp "public/icon-st-v2-${size}.png" "public/icon-${size}.png"
done
magick "$source_icon" -resize 410x410 -background '#0B0810' -gravity center -extent 512x512 -alpha remove -alpha off -strip public/icon-st-v2-maskable-512.png
magick "$source_icon" -resize 180x180 -alpha off -strip public/apple-touch-icon-st-v2.png
for size in 16 32; do
  magick "$source_icon" -resize "${size}x${size}" -alpha off -strip "public/favicon-st-v2-${size}.png"
done
