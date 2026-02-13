#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MM_DIR="${MM_DIR:-$ROOT_DIR/runtime/MagicMirror}"

if [ ! -d "$MM_DIR" ]; then
  echo "MagicMirror runtime not found at $MM_DIR"
  echo "Run ./scripts/bootstrap.sh first."
  exit 1
fi

mkdir -p "$MM_DIR/config" "$MM_DIR/css" "$MM_DIR/modules"

cp "$ROOT_DIR/mirror-config/config.js" "$MM_DIR/config/config.js"
cp "$ROOT_DIR/mirror-config/custom.css" "$MM_DIR/css/custom.css"

for module_path in "$ROOT_DIR/custom_modules"/*; do
  [ -d "$module_path" ] || continue
  module_name="$(basename "$module_path")"
  target_path="$MM_DIR/modules/$module_name"

  mkdir -p "$target_path"
  rsync -a --delete --exclude node_modules/ "$module_path"/ "$target_path"/

  if [ -f "$target_path/package.json" ]; then
    if [ ! -d "$target_path/node_modules" ] || [ "$target_path/package.json" -nt "$target_path/node_modules" ]; then
      (cd "$target_path" && npm install --omit=dev --no-audit --no-fund)
    fi
  fi
done

echo "Synced config and custom modules into $MM_DIR"
