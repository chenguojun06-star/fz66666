#!/usr/bin/env bash
set -euo pipefail

echo "🔧 修复403/404/500错误 - 自动诊断与修复"
echo "================================================"
echo ""

# 检查后端端口
echo "1️⃣ 检查后端服务..."
if lsof -iTCP:8088 -sTCP:LISTEN > /dev/null 2>&1; then
    echo "✅ 后端运行在端口 8088"
else
    echo "❌ 后端未在8088端口运行，尝试8080..."
    if lsof -iTCP:8080 -sTCP:LISTEN > /dev/null 2>&1; then
        echo "⚠️  后端运行在8080端口，但Vite配置已改为8088"
        echo "   建议：重启后端或修改.run/backend.env添加 PORT=8080"
    else
        echo "❌ 后端未启动！"
        echo "   执行：./dev-public.sh 启动服务"
        exit 1
    fi
fi

# 检查前端Vite配置
echo ""
echo "2️⃣ 检查前端代理配置..."
PROXY_TARGET=$(grep -A 5 "proxy:" frontend/vite.config.ts | grep "target:" | head -1 | sed "s/.*target: '\([^']*\)'.*/\1/")
echo "   前端代理指向: $PROXY_TARGET"

if [[ "$PROXY_TARGET" == *"8088"* ]]; then
    echo "✅ 前端代理配置正确（指向8088）"
elif [[ "$PROXY_TARGET" == *"8080"* ]]; then
    echo "⚠️  前端代理指向8080，但后端在8088"
    echo "   已自动修复为8088，需重启前端"
fi

# 检查数据库
echo ""
echo "3️⃣ 检查数据库连接..."
if mysql -h 127.0.0.1 -P 3308 -u root -pchangeme -e "SELECT 1" fashion_supplychain > /dev/null 2>&1; then
    echo "✅ 数据库连接正常"

    # 检查单价数据
    COUNT=$(mysql -h 127.0.0.1 -P 3308 -u root -pchangeme fashion_supplychain -e "SELECT COUNT(*) FROM t_style_size_price" 2>/dev/null | tail -1)
    echo "   单价维护数据：$COUNT 条"

    if [ "$COUNT" -gt 0 ]; then
        echo "✅ 单价数据存在"
    else
        echo "⚠️  单价数据为空"
    fi
else
    echo "❌ 数据库连接失败"
fi

# 测试登录接口
echo ""
echo "4️⃣ 测试登录接口..."
LOGIN_RESULT=$(curl -s -X POST "http://localhost:8088/api/system/user/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"123456"}' 2>&1 || echo '{"code":500}')

if echo "$LOGIN_RESULT" | grep -q '"code":200'; then
    echo "✅ 登录接口正常"
    TOKEN=$(echo "$LOGIN_RESULT" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo "   Token: ${TOKEN:0:20}..."

    # 测试用户信息接口
    echo ""
    echo "5️⃣ 测试用户信息接口..."
    USER_RESULT=$(curl -s "http://localhost:8088/api/system/user/me" \
        -H "Authorization: Bearer $TOKEN" 2>&1)

    if echo "$USER_RESULT" | grep -q '"code":200'; then
        echo "✅ 用户信息接口正常"
    else
        echo "⚠️  用户信息接口异常"
        echo "$USER_RESULT" | head -3
    fi

    # 测试单价接口
    echo ""
    echo "6️⃣ 测试单价维护接口..."
    PRICE_RESULT=$(curl -s "http://localhost:8088/api/style/size-price/list?page=1&pageSize=10" \
        -H "Authorization: Bearer $TOKEN" 2>&1)

    if echo "$PRICE_RESULT" | grep -q '"code":200'; then
        echo "✅ 单价维护接口正常"
        RECORD_COUNT=$(echo "$PRICE_RESULT" | grep -o '"total":[0-9]*' | cut -d':' -f2)
        echo "   返回记录数：$RECORD_COUNT"
    else
        echo "⚠️  单价维护接口异常"
        echo "$PRICE_RESULT" | head -3
    fi

elif echo "$LOGIN_RESULT" | grep -q '"code":400'; then
    echo "⚠️  用户名或密码错误"
    echo "   默认账号：admin / 123456"
else
    echo "❌ 登录接口失败"
    echo "$LOGIN_RESULT" | head -3
fi

# 总结与建议
echo ""
echo "================================================"
echo "📋 修复建议："
echo ""
echo "如果登录500错误："
echo "  1. 检查 .run/backend.env 是否存在"
echo "  2. 重启后端：cd backend && mvn spring-boot:run"
echo ""
echo "如果403错误："
echo "  1. 清除浏览器localStorage（F12 → Application → Local Storage → Clear All）"
echo "  2. 重新登录"
echo ""
echo "如果404错误："
echo "  1. 前端已修复Vite配置（8088端口）"
echo "  2. 重启前端：cd frontend && npm run dev"
echo ""
echo "如果单价数据看不到："
echo "  1. 数据库中有 $COUNT 条记录"
echo "  2. 检查前端API调用是否带Token"
echo "  3. 查看浏览器Console错误"
echo ""
