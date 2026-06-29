#!/usr/bin/env python3
"""
PCM Upload Worker — /volume1/PCM/app/upload_drive.py

Uploads a completed NAS recording to Google Drive using rclone,
verifies the upload, reports status to the dashboard, then
triggers cleanup once archived.

Prerequisites:
  - rclone installed at /volume1/PCM/bin/rclone
  - Service account JSON at /volume1/PCM/config/service_account.json
  - rclone configured (done by configure_rclone.sh)
  - PCM_ENDPOINT and PCM_SECRET env vars set

Usage:
  python3 /volume1/PCM/app/upload_drive.py --studio "Studio 1" --recording "STUDIO 1 2"
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, "/volume1/PCM/app")
from core.reporter import report

CONFIG   = Path("/volume1/PCM/config/settings.json")
RCLONE   = Path("/volume1/PCM/bin/rclone")
RCLONE_CONFIG = Path("/volume1/PCM/config/rclone.conf")

# Google Drive remote name (as configured in rclone.conf)
DRIVE_REMOTE = "gdrive"

# Root folder name inside Google Drive where backups live
DRIVE_ROOT = "ATEM Backups"


def load_config():
    return json.load(open(CONFIG))


def load_manifest(local_dir: Path) -> dict:
    manifest_path = local_dir / "pcm_manifest.json"
    if not manifest_path.exists():
        raise RuntimeError(f"No manifest found at {manifest_path}")
    return json.loads(manifest_path.read_text())


def rclone(*args) -> subprocess.CompletedProcess:
    """Run an rclone command, printing output live."""
    cmd = [
        str(RCLONE),
        "--config", str(RCLONE_CONFIG),
        *args
    ]
    print(f"[rclone] {' '.join(str(a) for a in args)}")
    return subprocess.run(cmd, check=True)


def count_drive_files(remote_path: str) -> int:
    """Count files in a Drive folder using rclone ls."""
    result = subprocess.run(
        [str(RCLONE), "--config", str(RCLONE_CONFIG), "ls", remote_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        return 0
    lines = [l for l in result.stdout.strip().splitlines() if l.strip()]
    return len(lines)


def main():
    parser = argparse.ArgumentParser(description="Upload a completed ATEM recording to Google Drive.")
    parser.add_argument("--studio",    required=True, help="e.g. 'Studio 1'")
    parser.add_argument("--recording", required=True, help="e.g. 'STUDIO 1 2'")
    parser.add_argument("--no-cleanup", action="store_true", help="Skip deleting NAS copy after upload")
    args = parser.parse_args()

    cfg       = load_config()
    local_dir = Path(cfg["backup_root"]) / args.studio / args.recording

    if not local_dir.exists():
        raise SystemExit(f"Local directory not found: {local_dir}")

    # Load manifest to get expected file count
    try:
        manifest = load_manifest(local_dir)
    except RuntimeError as e:
        report(args.studio, args.recording, "failed", error=str(e))
        raise SystemExit(str(e))

    expected_files = manifest.get("file_count", 0)
    total_bytes    = manifest.get("total_bytes", 0)

    # Drive destination: ATEM Backups / Studio 1 / STUDIO 1 2
    drive_dest = f"{DRIVE_REMOTE}:{DRIVE_ROOT}/{args.studio}/{args.recording}"

    print(f"\n[upload] Studio:    {args.studio}")
    print(f"[upload] Recording: {args.recording}")
    print(f"[upload] Local:     {local_dir}")
    print(f"[upload] Drive:     {drive_dest}")
    print(f"[upload] Expected:  {expected_files} files / {total_bytes:,} bytes\n")

    # Report upload starting
    report(args.studio, args.recording, "uploading")

    try:
        # Copy to Drive — skip pcm internal files, use checksums
        rclone(
            "copy",
            str(local_dir),
            drive_dest,
            "--checksum",
            "--exclude", "pcm_manifest.json",
            "--exclude", ".pcm_copy_complete",
            "--progress",
            "--transfers", "4",
        )
    except subprocess.CalledProcessError as e:
        report(args.studio, args.recording, "failed", error=f"rclone copy failed: {e}")
        raise SystemExit(f"Upload failed: {e}")

    # Verify: count files on Drive
    actual_files = count_drive_files(drive_dest)
    print(f"\n[upload] Verification: expected {expected_files} files, found {actual_files} on Drive")

    if actual_files < expected_files:
        err = f"Upload verification failed: expected {expected_files} files, got {actual_files} on Drive"
        report(args.studio, args.recording, "failed", error=err)
        raise SystemExit(err)

    # Build the Drive folder URL to store in dashboard
    # We get the folder ID via rclone lsf
    drive_url = None
    try:
        result = subprocess.run(
            [str(RCLONE), "--config", str(RCLONE_CONFIG),
             "lsf", "--dirs-only", "--format", "pi",
             f"{DRIVE_REMOTE}:{DRIVE_ROOT}/{args.studio}/"],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            if args.recording in line:
                folder_id = line.split(";")[0].strip()
                drive_url = f"https://drive.google.com/drive/folders/{folder_id}"
                break
    except Exception:
        pass  # Drive URL is optional

    # Report archived
    report(
        args.studio, args.recording, "archived",
        drive_url=drive_url,
        file_count=actual_files,
        total_bytes=total_bytes,
    )
    print(f"\n[upload] ✓ Archived to Google Drive: {drive_dest}")

    # Cleanup NAS copy
    if not args.no_cleanup:
        print(f"[upload] Deleting NAS copy: {local_dir}")
        import shutil
        shutil.rmtree(local_dir)
        print(f"[upload] ✓ NAS copy deleted")
    else:
        print(f"[upload] --no-cleanup set — NAS copy kept at {local_dir}")


if __name__ == "__main__":
    main()
