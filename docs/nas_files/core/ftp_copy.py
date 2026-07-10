import ftplib
import json
import os
from pathlib import Path
from datetime import datetime

IGNORE = {
    ".Spotlight-V100",
    ".Trashes",
    "System Volume Information",
    "$RECYCLE.BIN",
    "@eaDir",
    ".fseventsd",
    "FOUND.000"
}

def connect(host, username="admin", password="", timeout=20):
    ftp = ftplib.FTP(host, timeout=timeout)
    ftp.login(username, password)
    ftp.set_pasv(True)
    return ftp

def is_dir(ftp, path):
    old = ftp.pwd()
    try:
        ftp.cwd(path)
        return True
    except Exception:
        return False
    finally:
        try:
            ftp.cwd(old)
        except Exception:
            pass

def list_names(ftp, path):
    old = ftp.pwd()
    try:
        ftp.cwd(path)
        return [Path(x).name for x in ftp.nlst()]
    finally:
        ftp.cwd(old)

def remote_size(ftp, path):
    try:
        return int(ftp.size(path) or 0)
    except Exception:
        return 0

def walk_remote(ftp, remote_dir):
    files = []

    def walk(path):
        for item in list_names(ftp, path):
            if item in IGNORE or item.startswith("."):
                continue

            remote = path.rstrip("/") + "/" + item

            if is_dir(ftp, remote):
                walk(remote)
            else:
                files.append({
                    "remote": remote,
                    "relative": remote.replace(remote_dir.rstrip("/") + "/", "", 1),
                    "size": remote_size(ftp, remote)
                })

    walk(remote_dir)
    return files

def copy_file(ftp, remote, local, expected_size):
    local = Path(local)
    partial = local.with_suffix(local.suffix + ".partial")
    local.parent.mkdir(parents=True, exist_ok=True)

    if local.exists() and local.stat().st_size == expected_size:
        return "exists"

    # Resume from existing partial rather than restarting — large ISO files
    # (40+ GB) frequently exceed a single FTP session; REST STREAM lets us
    # pick up where we left off instead of discarding progress each retry.
    offset = partial.stat().st_size if partial.exists() else 0
    if offset > 0:
        print(f"  resuming {Path(remote).name} from {offset / 1e9:.1f} GB")

    with open(partial, "ab" if offset > 0 else "wb") as f:
        ftp.retrbinary(f"RETR {remote}", f.write, rest=offset if offset > 0 else None)

    actual = partial.stat().st_size
    if expected_size and actual != expected_size:
        raise RuntimeError(f"Size mismatch: {remote}: expected {expected_size}, got {actual}")

    partial.rename(local)
    return "copied"

def write_manifest(local_dir, studio, recording, files):
    manifest = {
        "studio": studio,
        "recording": recording,
        "copied_at": datetime.utcnow().isoformat() + "Z",
        "file_count": len(files),
        "total_bytes": sum(f["size"] for f in files),
        "files": files
    }

    Path(local_dir, "pcm_manifest.json").write_text(json.dumps(manifest, indent=2))
    Path(local_dir, ".pcm_copy_complete").write_text(datetime.utcnow().isoformat() + "Z\n")

def copy_recording(host, studio, remote_dir, local_dir):
    ftp = connect(host)

    try:
        files = walk_remote(ftp, remote_dir)

        for f in files:
            local = Path(local_dir) / f["relative"]
            result = copy_file(ftp, f["remote"], local, f["size"])
            print(f"{result}: {f['relative']}")

        write_manifest(local_dir, studio, Path(remote_dir).name, files)
        print("COPY COMPLETE")

    finally:
        try:
            ftp.quit()
        except Exception:
            pass
