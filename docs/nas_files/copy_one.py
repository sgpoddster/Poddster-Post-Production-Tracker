#!/usr/bin/env python3
"""
PCM copy_one — /volume1/PCM/app/copy_one.py
Copies one named ATEM recording folder to the NAS and reports status to the dashboard.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, "/volume1/PCM/app")

from core.ftp_copy import copy_recording
from core.reporter import report

CONFIG = Path("/volume1/PCM/config/settings.json")


def load_config():
    return json.load(open(CONFIG))


def main():
    parser = argparse.ArgumentParser(description="Copy one ATEM recording folder.")
    parser.add_argument("--studio",    required=True, help="Studio name, e.g. 'Studio 1'")
    parser.add_argument("--root",      required=True, help="Remote SSD root, e.g. /Studio1SSD")
    parser.add_argument("--recording", required=True, help="Recording folder name")
    args = parser.parse_args()

    cfg    = load_config()
    studio = next((s for s in cfg["studios"] if s["name"] == args.studio), None)
    if not studio:
        raise SystemExit(f"Unknown studio: {args.studio}")

    remote_dir = args.root.rstrip("/") + "/" + args.recording
    local_dir  = Path(cfg["backup_root"]) / args.studio / args.recording

    print(f"Studio:    {args.studio}")
    print(f"Host:      {studio['ip']}")
    print(f"Remote:    {remote_dir}")
    print(f"Local:     {local_dir}")

    # Report copy starting
    report(args.studio, args.recording, "copying", nas_path=str(local_dir))

    try:
        result = copy_recording(
            host=studio["ip"],
            studio=args.studio,
            remote_dir=remote_dir,
            local_dir=str(local_dir),
        )

        # Report success with file stats from manifest
        manifest_path = local_dir / "pcm_manifest.json"
        file_count, total_bytes = None, None
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text())
            file_count  = manifest.get("file_count")
            total_bytes = manifest.get("total_bytes")

        report(
            args.studio, args.recording, "copy_complete",
            nas_path=str(local_dir),
            file_count=file_count,
            total_bytes=total_bytes,
        )

    except Exception as e:
        report(args.studio, args.recording, "failed", error=str(e))
        raise


if __name__ == "__main__":
    main()
