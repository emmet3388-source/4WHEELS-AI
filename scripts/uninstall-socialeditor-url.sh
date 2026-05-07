#!/bin/zsh
set -euo pipefail

HOST_NAME="SocialEditor"
PLIST="/Library/LaunchDaemons/com.4wheels.socialeditor.proxy.plist"
PROXY_SCRIPT="/Library/Application Support/4WHEELS-AI/socialeditor-proxy.js"

echo "Removing http://${HOST_NAME} local proxy"

sudo launchctl bootout system "$PLIST" 2>/dev/null || true
sudo rm -f "$PLIST"
sudo rm -f "$PROXY_SCRIPT"

if grep -qE "^[[:space:]]*127\.0\.0\.1[[:space:]].*\\b${HOST_NAME}\\b" /etc/hosts; then
  sudo sed -i '' "/^[[:space:]]*127\\.0\\.0\\.1[[:space:]].*\\b${HOST_NAME}\\b/d" /etc/hosts
fi

echo "Removed."
