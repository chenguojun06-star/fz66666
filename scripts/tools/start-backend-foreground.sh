#!/bin/bash
# 前台运行后端，方便调试

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT_DIR/.run/backend.env"

# 加载环境变量
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
  echo "✅ 已加载环境变量文件"
else
  echo "❌ 环境变量文件不存在: $ENV_FILE"
  exit 1
fi

# 显示关键配置
echo "关键配置:"
echo "  JAVA_HOME: $JAVA_HOME"
echo "  DATABASE: ${SPRING_DATASOURCE_URL:0:60}..."
echo "  JWT_SECRET: ${APP_AUTH_JWT_SECRET:0:30}..."
echo ""

cd "$ROOT_DIR/backend" || exit 1

echo "启动后端（前台运行）..."
echo ""

mvn spring-boot:run -Dmaven.test.skip=true
