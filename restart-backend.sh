#!/bin/bash
cd "$(dirname "$0")/backend"
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export APP_AUTH_JWT_SECRET=ThisIsA_LocalJwtSecret_OnlyForDev_0123456789
export SPRING_DATASOURCE_URL="jdbc:mysql://127.0.0.1:3308/fashion_supplychain?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true"
export SPRING_DATASOURCE_USERNAME=root
export SPRING_DATASOURCE_PASSWORD=changeme
export WECHAT_MINI_PROGRAM_MOCK_ENABLED=true

# 先停止已有后端实例，避免旧进程残留
pkill -f "spring-boot:run|org.springframework.boot.loader.JarLauncher|com.fashion.supplychain" >/dev/null 2>&1 || true

# 等待 8088 端口释放
for i in {1..20}; do
	if ! lsof -nP -iTCP:8088 -sTCP:LISTEN >/dev/null 2>&1; then
		break
	fi
	sleep 0.5
done

nohup mvn spring-boot:run -Dmaven.test.skip=true -q > /tmp/backend-start.log 2>&1 &
echo "Backend PID: $!"
