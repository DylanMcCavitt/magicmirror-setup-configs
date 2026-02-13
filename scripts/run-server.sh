#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/bootstrap.sh"

cd "$ROOT_DIR/runtime/MagicMirror"

if node -e 'const scripts=(require("./package.json").scripts||{}); process.exit(scripts.server ? 0 : 1);'; then
  npm run server
else
  npm start -- --serverOnly
fi
