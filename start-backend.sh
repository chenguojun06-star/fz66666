#!/bin/bash

# 服装供应链系统 - 后端启动脚本
# 简化后端启动流程

echo "🚀 启动后端服务..."

# 固定 Java 17（Lombok 不兼容 Java 25）
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"

# 进入后端目录
cd "$(dirname "$0")/backend" || exit 1

# 检查是否已有进程在运行
if ps aux | grep -v grep | grep "spring-boot:run" > /dev/null; then
    echo "⚠️  检测到后端服务已在运行"
    read -p "是否停止旧进程并重启？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🛑 停止旧进程..."
        pkill -f "spring-boot:run"
        sleep 2
    else
        echo "❌ 取消启动"
        exit 0
    fi
fi

# 启动后端服务
echo "📦 启动 Spring Boot..."
nohup mvn spring-boot:run > logs/backend.log 2>&1 &

# 等待启动
echo "⏳ 等待服务启动..."
sleep 5

# 检查是否成功
if ps aux | grep -v grep | grep "spring-boot:run" > /dev/null; then
    echo "✅ 后端服务启动成功！"
    echo "📊 服务地址: http://localhost:8088"
    echo "📄 日志文件: backend/logs/backend.log"
    echo ""
    echo "💡 查看日志: tail -f backend/logs/backend.log"
    echo "💡 查看实时日志: tail -f backend/nohup.out"
else
    echo "❌ 后端服务启动失败，请检查日志"
    tail -20 logs/backend.log 2>/dev/null || tail -20 nohup.out
    exit 1
fi
