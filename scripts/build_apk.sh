#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Pulsar Music Player: Android APK Build ==="
cd "$ROOT_DIR"

node "$SCRIPT_DIR/build_apk_runner.mjs"
