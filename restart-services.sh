#!/usr/bin/env bash
set -euo pipefail

echo "🚀 一键修复并重启服务"
echo "================================"
echo ""

# 1. 停止现有服务
echo "1️⃣ 停止现有服务..."
pkill -f "vite" 2>/dev/null || true
pkill -f "spring-boot:run" 2>/dev/null || true
sleep 2

# 2. 启动后端（8088端口）
echo ""
echo "2️⃣ 启动后端服务（端口8088）..."
cd backend
nohup mvn spring-boot:run > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo "   后端PID: $BACKEND_PID"
cd ..

# 3. 等待后端启动
echo ""
echo "3️⃣ 等待后端启动..."
for i in {1..30}; do
    if curl -s http://localhost:8088/actuator/health > /dev/null 2>&1; then
        echo "✅ 后端启动成功"
        break
    fi
    echo -n "."
    sleep 1
done

# 4. 启动前端（5173端口，代理到8088）
echo ""
echo ""
echo "4️⃣ 启动前端服务（端口5173，代理到8088）..."
cd frontend
nohup npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   前端PID: $FRONTEND_PID"
cd ..

# 5. 等待前端启动
echo ""
echo "5️⃣ 等待前端启动..."
for i in {1..20}; do
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        echo "✅ 前端启动成功"
        break
    fi
    echo -n "."
    sleep 1
done

# 6. 验证服务
echo ""
echo ""
echo "6️⃣ 验证服务..."
echo "   后端: http://localhost:8088"
curl -s http://localhost:8088/actuator/health | head -1
echo ""
echo "   前端: http://localhost:5173"
curl -s -I http://localhost:5173 2>&1 | head -1

# 7. 测试登录
echo ""
echo "7️⃣ 测试登录接口..."
LOGIN_RESULT=$(curl -s -X POST "http://localhost:5173/api/system/user/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"123456"}')

if echo "$LOGIN_RESULT" | grep -q '"code":200'; then
    echo "✅ 登录成功"
    TOKEN=$(echo "$LOGIN_RESULT" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo "   Token: ${TOKEN:0:40}..."
elif echo "$LOGIN_RESULT" | grep -q '"code":400'; then
    echo "⚠️  密码错误，尝试重置..."
    mysql -h 127.0.0.1 -P 3308 -u root -pchangeme fashion_supplychain -e \
        "UPDATE t_user SET password = '\$2a\$10\$N4LKE3zLCUvLf3.C2Kq4nOJpN/8NQT8p3pF8LRqD5E3Q5U5rW9Jl2' WHERE username = 'admin'" 2>/dev/null
    echo "   密码已重置为: 123456"
    echo "   请刷新页面重新登录"
else
    echo "❌ 登录失败"
    echo "$LOGIN_RESULT" | head -3
fi

echo ""
echo "================================"
echo "✅ 服务已启动！"
echo ""
echo "📍 访问地址："
echo "   前端: http://localhost:5173"
echo "   后端API: http://localhost:8088"
echo "   Swagger: http://localhost:8088/swagger-ui.html"
echo ""
echo "👤 登录账号："
echo "   用户名: admin"
echo "   密码: 123456"
echo ""
echo "📋 查看日志："
echo "   后端: tail -f logs/backend.log"
echo "   前端: tail -f logs/frontend.log"
echo ""
echo "🛑 停止服务："
echo "   pkill -f vite"
echo "   pkill -f spring-boot:run"
echo ""
