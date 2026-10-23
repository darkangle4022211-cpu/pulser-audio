#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

VERSION="${1:-$(node -p "require('./package.json').version" 2>/dev/null || echo "1.1.5")}"

echo "=== Building Pulsar Music Player Linux AppImage Package (${VERSION}) ==="

# 1. Build Vite frontend
echo "1. Building web frontend assets..."
./node_modules/.bin/vite build
cp -r test-tracks dist/ 2>/dev/null || true

# 2. Package with electron-builder for Linux AppImage
echo "2. Packaging AppImage with electron-builder..."
npx electron-builder --linux AppImage

# 3. Copy AppImage to releases and home folder
mkdir -p "$DIR/releases"
APPIMAGE_SRC=$(ls -t "$DIR"/dist-electron/*.AppImage 2>/dev/null | head -n 1)
if [ -n "$APPIMAGE_SRC" ] && [ -f "$APPIMAGE_SRC" ]; then
  APPIMAGE_NAME=$(basename "$APPIMAGE_SRC")
  cp -f "$APPIMAGE_SRC" "$DIR/releases/${APPIMAGE_NAME}"
  cp -f "$APPIMAGE_SRC" "$HOME/${APPIMAGE_NAME}"
  chmod +x "$HOME/${APPIMAGE_NAME}"
  echo "✅ Copied AppImage to releases and home directory: $HOME/${APPIMAGE_NAME}"
fi

# Copy latest-linux.yml
if [ -f "$DIR/dist-electron/latest-linux.yml" ]; then
  cp -f "$DIR/dist-electron/latest-linux.yml" "$DIR/releases/latest-linux.yml"
fi

if [ -f "$DIR/dist-electron/Pulsar Music Player-${VERSION}.AppImage" ]; then
  ln -sf "Pulsar Music Player-${VERSION}.AppImage" "$DIR/dist-electron/Pulsar-Music-Player-${VERSION}.AppImage"
fi

echo "=== SUCCESS: Linux AppImage built ==="
ls -lh dist-electron/*.AppImage dist-electron/latest-linux.yml 2>/dev/null || true
