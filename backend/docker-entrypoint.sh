#!/bin/bash
set -e

echo "[entrypoint] Starting Spring Boot on port ${PORT:-8088}"
echo "[entrypoint] JAVA_OPTS: ${JAVA_OPTS:-none}"

# JVM 参数说明（2026-09-13：回滚 D-388 的 JIT 改动）：
# - 恢复 -XX:TieredStopAtLevel=1。D-388 以"没有 C2 会拖慢向量化吞吐"为由移除，
#   但代价被低估了：容器只有 1 vCPU，不锁 C1 时 C2 编译线程会和类加载抢唯一 CPU，
#   冷启动被拉长到 118s+，端口 8088 迟迟不监听 → CloudBase 存活探针 connection refused
#   → backend-2577 / 2578 / 2579 连续部署失败。
#   吞吐损失可接受：向量化批处理是 embedding / 视觉 API 的网络 IO 密集，不吃 C2 编译。
# - 加 -XX:+ExitOnOutOfMemoryError：OOM 后立刻退出让编排重启，好过进程半死不活继续接请求。
# - MaxRAMPercentage 维持 60：容器 2G，70 会把堆外/直接内存挤爆，不动。
# ⚠️ D-388 的另一半假设是错的：Dockerfile 里的 HEALTHCHECK 在 CloudBase(k8s/TKE) 上
#   **完全不生效**，k8s 只认 Pod spec 探针。所以 start-period=300s 从来不是启动保护，
#   真正生效的是云托管控制台「服务设置 → 健康检查」里的探针参数。
exec java \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -XX:+UseContainerSupport \
  -XX:MaxRAMPercentage=60.0 \
  -XX:MaxMetaspaceSize=256m \
  -XX:+TieredCompilation \
  -XX:TieredStopAtLevel=1 \
  -XX:+ExitOnOutOfMemoryError \
  -Dspring.jmx.enabled=false \
  -Duser.timezone=Asia/Shanghai \
  -Djava.net.preferIPv4Stack=true \
  -Djava.security.egd=file:/dev/./urandom \
  -Dserver.address=0.0.0.0 \
  -Dserver.port=${PORT:-8088} \
  $JAVA_OPTS \
  -jar /app/app.jar
