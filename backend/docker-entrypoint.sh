#!/bin/bash
set -e

# ── P0 事故修复记录 ──────────────────────────────────────────────────────────
# 事故编号：INC-20260611-001
# 原因：socat 用 "localhost" 转发，Linux IPv6 优先导致解析为 ::1，
#       Tomcat 只监听 IPv4 0.0.0.0，socat 连 ::1:8089 被拒 → 全线 502
# 修复：去掉 socat 代理层，Tomcat 直接监听 PORT 环境变量指定的端口
# ─────────────────────────────────────────────────────────────────────────────

echo "[entrypoint] Starting Spring Boot on port ${PORT:-8088}"
exec java \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -XX:+UseContainerSupport \
  -XX:MaxRAMPercentage=50.0 \
  -XX:MaxMetaspaceSize=256m \
  -Dspring.jmx.enabled=false \
  -Duser.timezone=Asia/Shanghai \
  -Djava.net.preferIPv4Stack=true \
  -jar /app/app.jar
