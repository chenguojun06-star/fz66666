#!/bin/bash
set -e

EXTERNAL_PORT=${PORT:-8088}
INTERNAL_PORT=8089

echo "[entrypoint] Starting socat proxy ${EXTERNAL_PORT} -> ${INTERNAL_PORT}"
socat TCP-LISTEN:${EXTERNAL_PORT},fork,reuseaddr TCP:localhost:${INTERNAL_PORT} &
SOCAT_PID=$!

echo "[entrypoint] Starting Spring Boot on internal port ${INTERNAL_PORT}"
PORT=${INTERNAL_PORT} exec java \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -XX:+UseContainerSupport \
  -XX:MaxRAMPercentage=50.0 \
  -XX:MaxMetaspaceSize=256m \
  -Dspring.jmx.enabled=false \
  -Duser.timezone=Asia/Shanghai \
  -jar /app/app.jar
