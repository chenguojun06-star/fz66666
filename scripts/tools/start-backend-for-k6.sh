#!/bin/bash
# 专门用于k6压力测试的后端启动脚本

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT_DIR/.run/backend.env"

# 加载环境变量
if [[ -f "$ENV_FILE" ]]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
  echo "已从 .run/backend.env 加载环境变量"
else
  echo "警告: 环境变量文件不存在: $ENV_FILE"
  # 使用默认值
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
  export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3308/fashion_supplychain?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true'
  export SPRING_DATASOURCE_USERNAME=root
  export SPRING_DATASOURCE_PASSWORD=changeme
  export APP_AUTH_JWT_SECRET=ThisIsA_LocalJwtSecret_OnlyForDev_0123456789
  export WECHAT_MINI_PROGRAM_MOCK_ENABLED=true
fi

cd "$ROOT_DIR/backend" || exit 1

echo "环境变量已设置"
echo "APP_AUTH_JWT_SECRET=${APP_AUTH_JWT_SECRET:0:20}..."
echo "启动后端..."

# 使用nohup在后台启动，日志输出到文件
nohup mvn spring-boot:run -Dmaven.test.skip=true > /tmp/backend-k6.log 2>&1 &

PID=$!
echo "后端已在后台启动，PID: $PID"
echo "日志文件: /tmp/backend-k6.log"
echo ""
echo "等待30秒让后端完全启动..."
sleep 30

# 检查健康状态
echo "检查后端健康状态..."
if curl -s http://localhost:8088/actuator/health | grep -q "UP"; then
    echo "✅ 后端启动成功！"
else
    echo "❌ 后端健康检查失败"
    echo "日志输出："
    tail -20 /tmp/backend-k6.log
    exit 1
fi

# 测试登录
echo ""
echo "测试登录接口..."
RESPONSE=$(curl -s -X POST http://localhost:8088/api/system/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123","tenantId":1}')

if echo "$RESPONSE" | grep -q '"code":200'; then
    echo "✅ 登录接口测试成功！"
    TOKEN=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)
    if [ -n "$TOKEN" ]; then
        echo "Token已获取（长度: ${#TOKEN}）"
        echo "$TOKEN" > /tmp/k6-jwt-token.txt
        echo "Token已保存到: /tmp/k6-jwt-token.txt"
    fi
else
    echo "❌ 登录接口测试失败"
    echo "响应: $RESPONSE"
    exit 1
fi

echo ""
echo "后端已就绪，可以开始k6压力测试！"
