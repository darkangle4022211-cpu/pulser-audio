#!/usr/bin/env python3
import os
import sys
import shutil
import subprocess
import json
import hashlib
import datetime

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))

# Read version from package.json or CLI
pkg_json_path = os.path.join(WORKSPACE_DIR, 'package.json')
with open(pkg_json_path, 'r', encoding='utf-8') as f:
    pkg_data = json.load(f)

version = sys.argv[1] if len(sys.argv) > 1 else pkg_data.get('version', '1.0.1')
pkg_name = f'pulsar-music-player_{version}_amd64'
deb_output = os.path.join(WORKSPACE_DIR, 'dist-electron', f'{pkg_name}.deb')

print(f"=== Building Pulsar Music Player Debian Package (v{version}) ===")

# Run bash build script
cmd = ['bash', os.path.join(WORKSPACE_DIR, 'scripts', 'build_deb.sh'), version]
subprocess.run(cmd, cwd=WORKSPACE_DIR, check=True)

print(f"✅ Package build complete: {deb_output}")
