#!/bin/bash

# 简单的后端启动脚本
# 用于测试后端修复

echo "=========================================="
echo "启动后端服务"
echo "=========================================="
echo ""

# 设置环境变量
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3308/fashion_supplychain?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true'
export SPRING_DATASOURCE_USERNAME=root
export SPRING_DATASOURCE_PASSWORD=changeme
export APP_AUTH_JWT_SECRET=ThisIsA_LocalJwtSecret_OnlyForDev_0123456789
export WECHAT_MINI_PROGRAM_MOCK_ENABLED=true

echo "环境变量已设置："
echo "  JAVA_HOME: $JAVA_HOME"
echo "  数据库: localhost:3308/fashion_supplychain"
echo ""

# 检查数据库
echo "检查数据库连接..."
if docker ps | grep -q "fashion-mysql-simple"; then
    echo "✅ 数据库容器运行中"
else
    echo "❌ 数据库容器未运行"
    echo "请运行: ./deployment/db-manager.sh start"
    exit 1
fi
echo ""

# 进入后端目录
cd "$(dirname "$0")/backend" || exit 1
echo "当前目录: $(pwd)"
echo ""

# 停止旧进程
echo "停止旧的后端进程..."
pkill -f "spring-boot:run" 2>/dev/null || true
sleep 2
echo ""

# 启动后端
echo "启动后端服务..."
echo "日志将输出到控制台"
echo "按 Ctrl+C 停止服务"
echo ""
echo "=========================================="
echo ""

mvn spring-boot:run -Dmaven.test.skip=true
