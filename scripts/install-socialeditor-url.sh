#!/bin/zsh
set -euo pipefail

HOST_NAME="SocialEditor"
TARGET_PORT="3000"
PLIST="/Library/LaunchDaemons/com.4wheels.socialeditor.proxy.plist"
PROXY_SCRIPT="/Library/Application Support/4WHEELS-AI/socialeditor-proxy.js"

echo "Installing http://${HOST_NAME} -> http://localhost:${TARGET_PORT}"

if ! grep -qE "^[[:space:]]*127\.0\.0\.1[[:space:]].*\\b${HOST_NAME}\\b" /etc/hosts; then
  echo "Adding ${HOST_NAME} to /etc/hosts"
  echo "127.0.0.1 ${HOST_NAME}" | sudo tee -a /etc/hosts >/dev/null
else
  echo "/etc/hosts already contains ${HOST_NAME}"
fi

sudo mkdir -p "$(dirname "$PROXY_SCRIPT")"

sudo tee "$PROXY_SCRIPT" >/dev/null <<'NODE'
const http = require("http");

const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = 3000;

const server = http.createServer((req, res) => {
  const proxyReq = http.request({
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: "SocialEditor",
    },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (error) => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`SocialEditor proxy cannot reach localhost:${TARGET_PORT}\n${error.message}`);
  });

  req.pipe(proxyReq);
});

server.listen(80, "127.0.0.1", () => {
  console.log("SocialEditor proxy listening on http://SocialEditor");
});
NODE

sudo tee "$PLIST" >/dev/null <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.4wheels.socialeditor.proxy</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>${PROXY_SCRIPT}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Library/Logs/4WHEELS-AI-socialeditor-proxy.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Library/Logs/4WHEELS-AI-socialeditor-proxy.err.log</string>
</dict>
</plist>
PLIST

sudo chown root:wheel "$PLIST"
sudo chmod 644 "$PLIST"

sudo launchctl bootout system "$PLIST" 2>/dev/null || true
sudo launchctl bootstrap system "$PLIST"
sudo launchctl kickstart -k system/com.4wheels.socialeditor.proxy

echo "Done. Open: http://${HOST_NAME}"
