#!/usr/bin/env python3
import sys
import json

try:
    import yt_dlp
except ImportError:
    sys.stderr.write("yt_dlp not found in python3\n")
    sys.exit(1)

ydl_opts = {
    'format': '140/251/ba/b',
    'quiet': True,
    'no_warnings': True,
    'extract_flat': False,
    'extractor_args': {'youtube': {'player_client': ['android']}},
}

try:
    ydl = yt_dlp.YoutubeDL(ydl_opts)
except Exception as e:
    sys.stderr.write(f"Failed to initialize YoutubeDL: {e}\n")
    sys.exit(1)

# Signal ready status to parent process
sys.stdout.write(json.dumps({"status": "ready"}) + "\n")
sys.stdout.flush()

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        req_id = req.get("id")
        url = req.get("url")
        if not url:
            res = {"id": req_id, "success": False, "error": "Empty URL"}
        else:
            info = ydl.extract_info(url, download=False)
            stream_url = info.get("url") if info else None
            if not stream_url and info and "formats" in info:
                for f in reversed(info["formats"]):
                    if f.get("url"):
                        stream_url = f.get("url")
                        break
            if stream_url:
                res = {"id": req_id, "success": True, "streamUrl": stream_url}
            else:
                res = {"id": req_id, "success": False, "error": "No stream URL found in format list"}
    except Exception as e:
        res = {"id": req.get("id"), "success": False, "error": str(e)}

    sys.stdout.write(json.dumps(res) + "\n")
    sys.stdout.flush()
