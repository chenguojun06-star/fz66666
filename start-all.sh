#!/bin/bash

echo "========================================="
echo "🚀 启动服装供应链系统"
echo "========================================="
echo ""

# 进入项目根目录
cd "$(dirname "$0")"

# 1. 检查并启动数据库
echo "📦 [1/3] 检查数据库..."
if ! docker ps | grep -q fashion-mysql-simple; then
    echo "  启动数据库..."
    docker start fashion-mysql-simple
    sleep 3
    echo "  ✅ 数据库已启动"
else
    echo "  ✅ 数据库已运行"
fi
echo ""

# 2. 启动后端
echo "🔧 [2/3] 启动后端..."
cd backend

# 设置环境变量（直接在命令中）
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3308/fashion_supplychain?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true'
export SPRING_DATASOURCE_USERNAME='root'
export SPRING_DATASOURCE_PASSWORD='changeme'
export APP_AUTH_JWT_SECRET='ThisIsA_LocalJwtSecret_OnlyForDev_0123456789'
export WECHAT_MINI_PROGRAM_MOCK_ENABLED='true'

# 固定 Java 21
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"

# 启动后端（后台运行）
nohup mvn spring-boot:run -q > ../logs/backend-$(date +%Y%m%d-%H%M%S).log 2>&1 &
BACKEND_PID=$!
echo "  后端启动中... PID=$BACKEND_PID"
echo "  日志: logs/backend-*.log"

cd ..

# 等待后端启动
echo "  等待后端就绪..."
for i in {1..30}; do
    if lsof -i:8088 -P -n 2>/dev/null | grep -q LISTEN; then
        echo "  ✅ 后端启动成功 (端口 8088)"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "  ⚠️  后端启动超时，请检查日志"
        exit 1
    fi
    sleep 1
done
echo ""

# 3. 启动前端
echo "🎨 [3/3] 启动前端..."
cd frontend

# 启动前端（后台运行）
nohup npm run dev -- --host 0.0.0.0 > ../logs/frontend-$(date +%Y%m%d-%H%M%S).log 2>&1 &
FRONTEND_PID=$!
echo "  前端启动中... PID=$FRONTEND_PID"
echo "  日志: logs/frontend-*.log"

cd ..

# 等待前端启动
echo "  等待前端就绪..."
for i in {1..15}; do
    if lsof -i:5173 -P -n 2>/dev/null | grep -q LISTEN; then
        echo "  ✅ 前端启动成功 (端口 5173)"
        break
    fi
    if [ $i -eq 15 ]; then
        echo "  ⚠️  前端启动超时，请检查日志"
        exit 1
    fi
    sleep 1
done
echo ""

# 显示访问信息
echo "========================================="
echo "✅ 所有服务启动完成！"
echo "========================================="
echo ""
echo "📍 访问地址："
echo "   本地: http://localhost:5173"
echo "   内网: http://192.168.1.18:5173"
echo ""
echo "📊 服务状态："
echo "   数据库: 端口 3308"
echo "   后端: 端口 8088 (PID $BACKEND_PID)"
echo "   前端: 端口 5173 (PID $FRONTEND_PID)"
echo ""
echo "📝 查看日志："
echo "   tail -f logs/backend-*.log"
echo "   tail -f logs/frontend-*.log"
echo ""
echo "========================================="
