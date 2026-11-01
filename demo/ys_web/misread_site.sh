#!/bin/sh
# The misread page as a static site (Cloudflare Pages and the like): the page as index.html, its data, the original
# Kokoro's audio, and the headers that let onnxruntime use several threads. The packages and onnxruntime come from
# jsDelivr, the models from Hugging Face, so the site itself is about 7 MB.
# usage: sh misread_site.sh [dir]   (default out/misread; after node misread.mjs)
#        npx wrangler pages deploy out/misread --project-name <name>
set -eu
cd "$(dirname "$0")"
OUT=${1:-out/misread}
rm -rf "$OUT"
mkdir -p "$OUT"
cp web/misread.html "$OUT/index.html"
cp web/misread.json "$OUT/"
cp -R web/misread "$OUT/misread"
cat >"$OUT/_headers" <<'H'
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
H
du -sh "$OUT"
