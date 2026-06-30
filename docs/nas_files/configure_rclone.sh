#!/bin/sh
# Configure rclone with a Google service account on the NAS.
# Run once after install_rclone.sh and after placing service_account.json.
#
# Prerequisites:
#   /volume1/PCM/config/service_account.json  — downloaded from Google Cloud Console
#
# Run: sh /volume1/PCM/scripts/configure_rclone.sh

RCLONE="/volume1/PCM/bin/rclone"
CONFIG="/volume1/PCM/config/rclone.conf"
SA_FILE="/volume1/PCM/config/service_account.json"

if [ ! -f "$SA_FILE" ]; then
    echo "ERROR: Service account JSON not found at $SA_FILE"
    echo "Download it from Google Cloud Console and place it there first."
    exit 1
fi

echo "Writing rclone config..."

cat > "$CONFIG" << EOF
[gdrive]
type = drive
scope = drive
service_account_file = $SA_FILE
team_drive = 0AIsnaQyK_rovUk9PVA
EOF

echo "Config written to $CONFIG"
echo ""
echo "Testing connection..."
"$RCLONE" --config "$CONFIG" lsd gdrive: --max-depth 1

echo ""
echo "If you see your Drive folders above, rclone is configured correctly."
