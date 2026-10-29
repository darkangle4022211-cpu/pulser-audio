#!/bin/bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

DEB_FILE="$DIR/dist-electron/pulsar-music-player_1.0.0_amd64.deb"

echo "=========================================================="
echo "    PULSAR MUSIC PLAYER - CLEAN INSTALLATION              "
echo "=========================================================="
echo ""
echo "Package: $DEB_FILE"
echo ""
echo "1. Removing any old versions and lingering files..."
echo "2. Performing clean installation of latest version"
echo ""
echo "Please enter your sudo password when prompted below:"
echo "----------------------------------------------------------"

# Terminate any running instances first
killall pulsar-music-player 2>/dev/null || true

# Remove old package versions cleanly
sudo apt remove --purge -y pulsar-music-player 2>/dev/null || sudo dpkg -P pulsar-music-player 2>/dev/null || true

# Install fresh package
sudo apt install -y "$DEB_FILE"
INSTALL_STATUS=$?

if [ $INSTALL_STATUS -ne 0 ]; then
    echo ""
    echo "----------------------------------------------------------"
    echo " [NOTICE] apt returned $INSTALL_STATUS. Trying fallback with dpkg..."
    sudo dpkg -i "$DEB_FILE"
    sudo apt-get install -f -y
    INSTALL_STATUS=$?
fi

echo ""
echo "----------------------------------------------------------"
if [ -f "/opt/pulsar-music-player/pulsar-music-player" ]; then
    echo " [SUCCESS] Pulsar Music Player installed cleanly!"
    echo " - Application Launcher: /usr/share/applications/pulsar-music-player.desktop"
    echo " - Command in terminal: pulsar-music-player"
    echo "----------------------------------------------------------"
    echo ""
    echo "You can launch the player now or search 'Pulsar Music Player' in your app menu."
    echo ""
    read -p "Press [ENTER] to launch Pulsar Music Player now..." -r dummy
    nohup pulsar-music-player >/dev/null 2>&1 &
    sleep 2
else
    echo " [FAILED] Installation could not complete."
    echo "----------------------------------------------------------"
fi
