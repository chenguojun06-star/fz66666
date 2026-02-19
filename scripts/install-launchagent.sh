#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LA_DIR="$HOME/Library/LaunchAgents"
PLIST_NAME="com.fashion.supplychain.dev.plist"
PLIST_PATH="$LA_DIR/$PLIST_NAME"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$HOME/Library/Logs/fashion-supplychain-dev"

mkdir -p "$LA_DIR"
mkdir -p "$RUN_DIR"
mkdir -p "$LOG_DIR"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.fashion.supplychain.dev</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>$ROOT_DIR/scripts/dev-up.sh</string>
      <string>up</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$HOME</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/launchagent.out.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/launchagent.err.log</string>
  </dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl load "$PLIST_PATH"

sleep 0.2

echo "已安装并启用开机自启（登录后自动启动）：$PLIST_PATH"
echo "LaunchAgent 日志：$LOG_DIR/launchagent.(out|err).log"
echo "查看外网地址：bash $ROOT_DIR/scripts/dev-up.sh url"

if [[ -f "$LOG_DIR/launchagent.err.log" ]] && grep -q "Operation not permitted" "$LOG_DIR/launchagent.err.log"; then
  echo "检测到 macOS 权限拦截（Operation not permitted）。"
  echo "解决方式：系统设置 -> 隐私与安全性 -> 完全磁盘访问权限，把 /bin/bash 加进去，然后重新执行本脚本。"
  echo "或把项目从 ~/Documents 移到不受保护目录（如 ~/Projects）再安装自启。"
fi
