#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

VERSION="${1:-$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.1")}"
PKG_NAME="pulsar-music-player_${VERSION}_amd64"

echo "=== Building Pulsar Music Player Native Linux .deb Package (${VERSION}) ==="

# 1. Build Vite frontend
echo "1. Building web frontend assets..."
./node_modules/.bin/vite build
cp -r test-tracks dist/

# 2. Package with electron-builder to generate linux-unpacked
echo "2. Packaging electron application..."
npx electron-builder --dir --linux

# 3. Assemble Debian package structure
PKG_DIR="/tmp/pulsar-deb-build"
rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/DEBIAN"
mkdir -p "$PKG_DIR/opt/pulsar-music-player"
mkdir -p "$PKG_DIR/usr/bin"
mkdir -p "$PKG_DIR/usr/share/applications"
mkdir -p "$PKG_DIR/usr/share/pixmaps"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/512x512/apps"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/256x256/apps"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/128x128/apps"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/64x64/apps"
mkdir -p "$PKG_DIR/usr/share/icons/hicolor/scalable/apps"

echo "3. Copying application binaries, icons, and launchers..."
cp -r "dist-electron/linux-unpacked/"* "$PKG_DIR/opt/pulsar-music-player/"
cp "build/icons/icon.png" "$PKG_DIR/usr/share/icons/hicolor/512x512/apps/pulsar-music-player.png"
cp "build/icons/256x256.png" "$PKG_DIR/usr/share/icons/hicolor/256x256/apps/pulsar-music-player.png"
cp "build/icons/128x128.png" "$PKG_DIR/usr/share/icons/hicolor/128x128/apps/pulsar-music-player.png"
cp "build/icons/64x64.png" "$PKG_DIR/usr/share/icons/hicolor/64x64/apps/pulsar-music-player.png"
cp "build/icons/icon.svg" "$PKG_DIR/usr/share/icons/hicolor/scalable/apps/pulsar-music-player.svg"
cp "build/icons/256x256.png" "$PKG_DIR/usr/share/pixmaps/pulsar-music-player.png"

# Ensure chrome-sandbox has 4755 permissions
if [ -f "$PKG_DIR/opt/pulsar-music-player/chrome-sandbox" ]; then
  chmod 4755 "$PKG_DIR/opt/pulsar-music-player/chrome-sandbox"
fi

# Create symlink launcher in /usr/bin/
ln -sf "/opt/pulsar-music-player/pulsar-music-player" "$PKG_DIR/usr/bin/pulsar-music-player"

# Bundle yt-dlp and static ffmpeg binaries for online streaming and mp3 downloading
mkdir -p "$PKG_DIR/opt/pulsar-music-player/bin"

YTDLP_BIN="$DIR/bin/yt-dlp"
if [ ! -f "$YTDLP_BIN" ]; then
  YTDLP_BIN="/home/hamza/.local/bin/yt-dlp"
fi
if [ ! -f "$YTDLP_BIN" ]; then
  YTDLP_BIN="$(which yt-dlp 2>/dev/null || true)"
fi
if [ -f "$YTDLP_BIN" ]; then
  cp "$YTDLP_BIN" "$PKG_DIR/opt/pulsar-music-player/bin/yt-dlp"
  chmod 755 "$PKG_DIR/opt/pulsar-music-player/bin/yt-dlp"
fi

FFMPEG_BIN="$DIR/bin/ffmpeg"
if [ ! -f "$FFMPEG_BIN" ]; then
  FFMPEG_BIN="/home/hamza/Applications/Recordly/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg"
fi
if [ ! -f "$FFMPEG_BIN" ]; then
  FFMPEG_BIN="$(which ffmpeg 2>/dev/null || true)"
fi
if [ -f "$FFMPEG_BIN" ]; then
  cp "$FFMPEG_BIN" "$PKG_DIR/opt/pulsar-music-player/bin/ffmpeg"
  chmod 755 "$PKG_DIR/opt/pulsar-music-player/bin/ffmpeg"
fi

# Ensure stream_resolver.py is available and executable in unpacked resources
mkdir -p "$PKG_DIR/opt/pulsar-music-player/resources/app.asar.unpacked/electron"
cp "$DIR/electron/stream_resolver.py" "$PKG_DIR/opt/pulsar-music-player/resources/app.asar.unpacked/electron/stream_resolver.py"
chmod 755 "$PKG_DIR/opt/pulsar-music-player/resources/app.asar.unpacked/electron/stream_resolver.py"

# Create .desktop file
cat << 'EOF' > "$PKG_DIR/usr/share/applications/pulsar-music-player.desktop"
[Desktop Entry]
Name=Pulsar Music Player
Comment=Offline MP3 Music Player with Custom Playlists & 10-Band EQ
Exec=/opt/pulsar-music-player/pulsar-music-player %U
Terminal=false
Type=Application
Icon=pulsar-music-player
StartupWMClass=pulsar-music-player
Categories=AudioVideo;Audio;Player;
MimeType=audio/mpeg;audio/mp3;audio/flac;audio/x-wav;audio/ogg;audio/aac;audio/x-m4a;
Keywords=mp3;music;player;audio;equalizer;offline;
EOF

chmod 644 "$PKG_DIR/usr/share/applications/pulsar-music-player.desktop"

# Post-installation hook (triggers desktop & icon cache rebuild)
cat << 'EOF' > "$PKG_DIR/DEBIAN/postinst"
#!/bin/sh
set -e
if [ "$1" = "configure" ]; then
    if which update-desktop-database >/dev/null 2>&1; then
        update-desktop-database -q /usr/share/applications || true
    fi
    if which gtk-update-icon-cache >/dev/null 2>&1; then
        gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
    fi
fi
exit 0
EOF
chmod 755 "$PKG_DIR/DEBIAN/postinst"

# Post-removal hook
cat << 'EOF' > "$PKG_DIR/DEBIAN/postrm"
#!/bin/sh
set -e
if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
    if which update-desktop-database >/dev/null 2>&1; then
        update-desktop-database -q /usr/share/applications || true
    fi
    if which gtk-update-icon-cache >/dev/null 2>&1; then
        gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
    fi
fi
exit 0
EOF
chmod 755 "$PKG_DIR/DEBIAN/postrm"

# Calculate Installed-Size (in KB)
INSTALLED_SIZE=$(du -s "$PKG_DIR" | cut -f1)

# Create Debian control file
cat << EOF > "$PKG_DIR/DEBIAN/control"
Package: pulsar-music-player
Version: ${VERSION}
Section: sound
Priority: optional
Architecture: amd64
Depends: libnotify4, libasound2 | libasound2t64
Installed-Size: ${INSTALLED_SIZE}
Maintainer: Pulsar Audio <support@pulsaraudio.local>
Homepage: https://github.com/darkangle4022211-cpu/pulser-audio
Description: Offline MP3 Music Player with Custom Playlists & 10-Band EQ
 High-fidelity offline music player featuring custom playlist management,
 real-time 60FPS audio visualizer, 10-band equalizer, ID3 metadata reader,
 and Linux desktop integration.
EOF

chmod 644 "$PKG_DIR/DEBIAN/control"

# 4. Build .deb package using native dpkg-deb with fast gzip compression
mkdir -p "$DIR/dist-electron"
DEB_FILE="$DIR/dist-electron/${PKG_NAME}.deb"
echo "4. Assembling Debian archive with dpkg-deb..."
dpkg-deb -Zgzip --build --root-owner-group "$PKG_DIR" "$DEB_FILE"

echo "=== SUCCESS: Debian package built ==="
ls -lh "$DEB_FILE"
dpkg-deb -I "$DEB_FILE"
rm -rf "$PKG_DIR"
rm -rf "$DIR/dist-electron/linux-unpacked"
rm -f "$DIR/dist-electron/builder-debug.yml" "$DIR/dist-electron/builder-effective-config.yaml"

# 5. Copy package to releases and home folder
mkdir -p "$DIR/releases"
cp -f "$DEB_FILE" "$DIR/releases/${PKG_NAME}.deb"
cp -f "$DEB_FILE" "$HOME/${PKG_NAME}.deb"
cp -f "$DEB_FILE" "$HOME/pulsar-music-player.deb"
echo "✅ Copied package to releases and home directory"

# 6. Generate update.json manifest with SHA256, size, and developer contacts
python3 -c "
import json, hashlib, os

deb_path = '$DEB_FILE'
size = os.path.getsize(deb_path)
with open(deb_path, 'rb') as f:
    sha = hashlib.sha256(f.read()).hexdigest()

platforms = {
    'linux-deb-x64': {
        'url': 'https://github.com/darkangle4022211-cpu/pulser-audio/releases/download/v$VERSION/${PKG_NAME}.deb',
        'sha256': sha,
        'size': size,
        'filename': '${PKG_NAME}.deb'
    }
}

win_setup_path = os.path.join('$DIR', 'dist-electron', 'Pulsar Music Player Setup $VERSION.exe')
if os.path.exists(win_setup_path):
    with open(win_setup_path, 'rb') as f:
        win_setup_sha = hashlib.sha256(f.read()).hexdigest()
    platforms['win-setup-x64'] = {
        'url': 'https://github.com/darkangle4022211-cpu/pulser-audio/releases/download/v$VERSION/Pulsar.Music.Player.Setup.$VERSION.exe',
        'sha256': win_setup_sha,
        'size': os.path.getsize(win_setup_path),
        'filename': 'Pulsar Music Player Setup $VERSION.exe'
    }

win_portable_path = os.path.join('$DIR', 'dist-electron', 'Pulsar Music Player Portable $VERSION.exe')
if os.path.exists(win_portable_path):
    with open(win_portable_path, 'rb') as f:
        win_portable_sha = hashlib.sha256(f.read()).hexdigest()
    platforms['win-portable-x64'] = {
        'url': 'https://github.com/darkangle4022211-cpu/pulser-audio/releases/download/v$VERSION/Pulsar.Music.Player.Portable.$VERSION.exe',
        'sha256': win_portable_sha,
        'size': os.path.getsize(win_portable_path),
        'filename': 'Pulsar Music Player Portable $VERSION.exe'
    }

manifest = {
    'name': 'pulser audio',
    'repo': 'darkangle4022211-cpu/pulser-audio',
    'version': '$VERSION',
    'tag': 'v$VERSION',
    'changelog': '• Offline Shuffle Isolation: Shuffling offline playlists or All Tracks stays strictly within local offline tracks with zero online streaming leaks\\n• Robust Playback Context: Seamlessly isolates offline library playback from online Discover & Flow streaming\\n• Clean Offline Queue End: Reaching the end of an offline playlist stops cleanly or loops locally with repeat\\n• Pure Desktop Electron Experience: Full Linux (.deb) and Windows (.exe) desktop audio playback\\n\\nIf you\\'re facing a problem, feel free to contact the developer:\\nEmail: hamza.zafar4022211@gmail.com',
    'support': {
        'message': 'If you\\'re facing a problem, feel free to contact the developer:',
        'email': 'hamza.zafar4022211@gmail.com'
    },
    'platforms': platforms
}

for out_path in ['$DIR/update.json', '$DIR/releases/update.json']:
    try:
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)
        print(f'✅ Generated update manifest: {out_path}')
    except Exception as e:
        print(f'Warning writing manifest to {out_path}: {e}')
"

