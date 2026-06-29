#!/bin/sh
# Install rclone on Synology DS223 (ARM64 / RTD1619B)
# Run once: sh /volume1/PCM/scripts/install_rclone.sh

set -e

RCLONE_VERSION="v1.68.2"
INSTALL_DIR="/volume1/PCM/bin"
mkdir -p "$INSTALL_DIR"

echo "Downloading rclone $RCLONE_VERSION for linux/arm64..."
curl -L "https://downloads.rclone.org/${RCLONE_VERSION}/rclone-${RCLONE_VERSION}-linux-arm64.zip" \
     -o /tmp/rclone.zip

echo "Extracting..."
cd /tmp
unzip -o rclone.zip
cp rclone-*-linux-arm64/rclone "$INSTALL_DIR/rclone"
chmod +x "$INSTALL_DIR/rclone"
rm -rf /tmp/rclone.zip /tmp/rclone-*-linux-arm64

echo "rclone installed at $INSTALL_DIR/rclone"
"$INSTALL_DIR/rclone" version
