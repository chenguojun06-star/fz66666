#!/bin/bash
set -e

echo "[entrypoint] Starting Spring Boot on port ${PORT:-8088}"
echo "[entrypoint] JAVA_OPTS: ${JAVA_OPTS:-none}"

# JVM 参数说明（2026-09-13 D-388）：
# - 去掉 -XX:TieredStopAtLevel=1：该参数把 JIT 锁在 C1，只为短命 serverless 省启动时间。
#   本服务是长驻 + 跑向量化批处理（单批 50 款 × 视觉分析），没有 C2 会显著拖慢吞吐。
#   启动多花几秒无所谓，HEALTHCHECK start-period=300s 足够兜住。
# - 加 -XX:+ExitOnOutOfMemoryError：OOM 后立刻退出让编排重启，好过进程半死不活继续接请求。
# - MaxRAMPercentage 维持 60：容器 2G，70 会把堆外/直接内存挤爆，不动。
exec java \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -XX:+UseContainerSupport \
  -XX:MaxRAMPercentage=60.0 \
  -XX:MaxMetaspaceSize=256m \
  -XX:+TieredCompilation \
  -XX:+ExitOnOutOfMemoryError \
  -Dspring.jmx.enabled=false \
  -Duser.timezone=Asia/Shanghai \
  -Djava.net.preferIPv4Stack=true \
  -Djava.security.egd=file:/dev/./urandom \
  -Dserver.address=0.0.0.0 \
  -Dserver.port=${PORT:-8088} \
  $JAVA_OPTS \
  -jar /app/app.jar
