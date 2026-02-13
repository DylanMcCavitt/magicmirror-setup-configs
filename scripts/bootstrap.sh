#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MM_DIR="${MM_DIR:-$ROOT_DIR/runtime/MagicMirror}"
MM_REPO="${MM_REPO:-https://github.com/MagicMirrorOrg/MagicMirror}"
MM_VERSION="${MM_VERSION:-v2.34.0}"

mkdir -p "$(dirname "$MM_DIR")"

if [ ! -d "$MM_DIR/.git" ]; then
  git clone --depth 1 --branch "$MM_VERSION" "$MM_REPO" "$MM_DIR"
else
  CURRENT_TAG="$(git -C "$MM_DIR" describe --tags --exact-match 2>/dev/null || true)"
  if [ "$CURRENT_TAG" != "$MM_VERSION" ]; then
    git -C "$MM_DIR" fetch --depth 1 origin "refs/tags/$MM_VERSION:refs/tags/$MM_VERSION"
    git -C "$MM_DIR" checkout "$MM_VERSION"
  fi
fi

if [ ! -d "$MM_DIR/node_modules" ]; then
  (cd "$MM_DIR" && npm install --omit=dev --no-audit --no-fund)
fi

"$ROOT_DIR/scripts/sync.sh"
