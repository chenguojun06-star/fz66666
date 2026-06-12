#!/bin/bash
set -e

echo "[entrypoint] Starting Spring Boot on port ${PORT:-8088}"
echo "[entrypoint] JAVA_OPTS: ${JAVA_OPTS:-none}"

exec java \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -XX:+UseContainerSupport \
  -XX:MaxRAMPercentage=60.0 \
  -XX:MaxMetaspaceSize=256m \
  -XX:+TieredCompilation \
  -XX:TieredStopAtLevel=1 \
  -Dspring.jmx.enabled=false \
  -Duser.timezone=Asia/Shanghai \
  -Djava.net.preferIPv4Stack=true \
  -Djava.security.egd=file:/dev/./urandom \
  -Dserver.address=0.0.0.0 \
  -Dserver.port=${PORT:-8088} \
  $JAVA_OPTS \
  -jar /app/app.jar
