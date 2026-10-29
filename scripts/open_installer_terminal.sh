#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export DISPLAY="${DISPLAY:-:0}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"

RUN_CMD="cd '$DIR' && bash 'scripts/install_deb.sh'; echo ''; echo '=========================================================='; echo 'Terminal session will remain open. You may close it anytime.'; echo '=========================================================='; exec bash"

if which ptyxis >/dev/null 2>&1; then
    ptyxis -s --title="Pulsar Music Player Installer" -- bash -c "$RUN_CMD"
elif which x-terminal-emulator >/dev/null 2>&1; then
    x-terminal-emulator -T "Pulsar Music Player Installer" -e bash -c "$RUN_CMD"
elif which gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --title="Pulsar Music Player Installer" -- bash -c "$RUN_CMD"
fi
