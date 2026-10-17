#!/usr/bin/env bash
# Runs the checks against the real app:
#   verify      - data integrity, re-solve logic, streaks, merge, rendered markup
#   interaction - the actual DOM: check a box, mark a re-solve, watch pet/heatmap
#   account     - the whole stack: real API process, sign-up, OTP, sync, board
# Each is bundled with Vite's SSR pipeline, so no extra build tooling is needed.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT_DIR=".verify"
rm -rf "$OUT_DIR"

for entry in verify interaction account; do
  echo "=== $entry ==="
  npx vite build --ssr "scripts/$entry.tsx" --outDir "$OUT_DIR/$entry" --logLevel warn
  node "$OUT_DIR/$entry/$entry.js"
  echo
done

echo "all checks passed"
