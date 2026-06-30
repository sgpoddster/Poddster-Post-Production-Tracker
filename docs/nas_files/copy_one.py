#!/usr/bin/env python3
"""
PCM copy_one — /volume1/PCM/app/copy_one.py
Copies one named ATEM recording folder to the NAS and reports status to the dashboard.
"""

import argparse
import json
import re
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, "/volume1/PCM/app")

from core.ftp_copy import connect, copy_recording
from core.reporter import _post, report

CONFIG   = Path("/volume1/PCM/config/settings.json")
INTERVAL = 10  # seconds between progress reports during copy


def load_config():
    return json.load(open(CONFIG))


def _dir_bytes(path):
    """Sum bytes of all files in path, including .partial files being written."""
    total = 0
    try:
        for f in Path(path).rglob("*"):
            if f.is_file() and f.name != "pcm_manifest.json":
                try:
                    total += f.stat().st_size
                except OSError:
                    pass
    except Exception:
        pass
    return total


def _fmt_speed(bps):
    if bps <= 0:
        return None
    mbps = bps * 8 / 1_000_000
    return f"{mbps:.0f} Mbps"


def _monitor_copy(studio, recording, local_dir, stop_event):
    """
    Background thread: monitors local_dir growth every INTERVAL seconds
    and pushes bytes_transferred + speed to the dashboard.
    """
    prev_bytes = 0
    prev_time  = time.time()

    while not stop_event.is_set():
        stop_event.wait(INTERVAL)
        now       = time.time()
        cur_bytes = _dir_bytes(local_dir)
        delta     = cur_bytes - prev_bytes
        dt        = now - prev_time

        speed_bps = delta / dt if dt > 0 else 0
        speed_str = _fmt_speed(speed_bps)

        try:
            _post("/api/pcm/progress", {
                "studio":            studio,
                "recording":         recording,
                "bytes_transferred": cur_bytes,
                "transfer_speed":    speed_str,
                "eta_seconds":       None,
            })
        except Exception as e:
            print(f"[copy] progress report failed: {e}")

        prev_bytes = cur_bytes
        prev_time  = now


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

    report(args.studio, args.recording, "copying", nas_path=str(local_dir))

    stop_event = threading.Event()
    monitor    = threading.Thread(
        target=_monitor_copy,
        args=(args.studio, args.recording, local_dir, stop_event),
        daemon=True,
    )
    monitor.start()

    try:
        result = copy_recording(
            host=studio["ip"],
            studio=args.studio,
            remote_dir=remote_dir,
            local_dir=str(local_dir),
        )

        manifest_path = local_dir / "pcm_manifest.json"
        file_count, total_bytes = None, None
        if manifest_path.exists():
            manifest    = json.loads(manifest_path.read_text())
            file_count  = manifest.get("file_count")
            total_bytes = manifest.get("total_bytes")

            # Get ATEM timestamps: folder MDTM (recording_time) + per-file MDTMs
            # (session_times) so upload_drive.py can split multi-session folders.
            if not manifest.get("session_times"):
                try:
                    ftp_cfg = cfg["ftp"]
                    ftp     = connect(studio["ip"], ftp_cfg["username"],
                                      ftp_cfg["password"], ftp_cfg.get("timeout_seconds", 30))

                    # Folder MDTM -> recording_time (end of last session)
                    try:
                        resp   = ftp.sendcmd(f"MDTM {remote_dir}")
                        rec_ts = datetime.strptime(resp.split()[-1], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
                        manifest["recording_time"] = rec_ts.isoformat()
                        print(f"[copy] Recording time: {rec_ts.isoformat()}")
                    except Exception as e:
                        print(f"[copy] WARNING: could not get folder MDTM: {e}")

                    # Per-file MDTMs -> session_times {suffix: end_time}
                    # Scans Video ISO Files and root for files ending in " NN.ext"
                    suffix_re     = re.compile(r' (\d{2})\.[a-zA-Z0-9]+$')
                    session_times = {}
                    for scan_dir in (f"{remote_dir}/Video ISO Files", remote_dir):
                        try:
                            for path in ftp.nlst(scan_dir):
                                m = suffix_re.search(path.split('/')[-1])
                                if m:
                                    suffix = m.group(1)
                                    try:
                                        resp = ftp.sendcmd(f"MDTM {path}")
                                        ts   = datetime.strptime(resp.split()[-1], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
                                        prev = session_times.get(suffix)
                                        if prev is None or ts > datetime.fromisoformat(prev):
                                            session_times[suffix] = ts.isoformat()
                                    except Exception:
                                        pass
                        except Exception:
                            pass

                    ftp.quit()

                    if session_times:
                        manifest["session_times"] = session_times
                        print(f"[copy] Sessions: {session_times}")

                    manifest_path.write_text(json.dumps(manifest, indent=2))

                except Exception as e:
                    print(f"[copy] WARNING: could not get ATEM timestamps: {e}")

        report(
            args.studio, args.recording, "copy_complete",
            nas_path=str(local_dir),
            file_count=file_count,
            total_bytes=total_bytes,
        )

    except Exception as e:
        report(args.studio, args.recording, "failed", error=str(e))
        raise

    finally:
        stop_event.set()
        monitor.join(timeout=5)


if __name__ == "__main__":
    main()
