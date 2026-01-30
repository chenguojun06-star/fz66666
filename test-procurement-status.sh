#!/bin/bash

# 采购状态联动功能快速测试脚本

echo "🧪 采购状态联动功能测试"
echo "================================"

# 获取第一个订单ID
echo ""
echo "📋 查询订单列表..."
ORDER_RESPONSE=$(curl -s "http://localhost:8088/api/production/order/list?current=1&size=1")

# 提取订单ID (使用jq如果可用，否则用grep)
if command -v jq &> /dev/null; then
    ORDER_ID=$(echo "$ORDER_RESPONSE" | jq -r '.data.records[0].id // empty')
    ORDER_NO=$(echo "$ORDER_RESPONSE" | jq -r '.data.records[0].orderNo // empty')
    STYLE_NO=$(echo "$ORDER_RESPONSE" | jq -r '.data.records[0].styleNo // empty')
else
    ORDER_ID=$(echo "$ORDER_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    ORDER_NO=$(echo "$ORDER_RESPONSE" | grep -o '"orderNo":"[^"]*"' | head -1 | cut -d'"' -f4)
    STYLE_NO=$(echo "$ORDER_RESPONSE" | grep -o '"styleNo":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -z "$ORDER_ID" ]; then
    echo "❌ 未找到订单数据，请先创建订单"
    exit 1
fi

echo "✅ 找到订单:"
echo "   订单ID: $ORDER_ID"
echo "   订单号: $ORDER_NO"
echo "   款号: $STYLE_NO"

# 测试采购状态API
echo ""
echo "📊 测试采购状态API..."
echo "GET /api/production/order/procurement-status/$ORDER_ID"
echo "--------------------------------"

PROCUREMENT_STATUS=$(curl -s "http://localhost:8088/api/production/order/procurement-status/$ORDER_ID")

if command -v jq &> /dev/null; then
    echo "$PROCUREMENT_STATUS" | jq '.'
    
    COMPLETED=$(echo "$PROCUREMENT_STATUS" | jq -r '.data.completed // false')
    RATE=$(echo "$PROCUREMENT_STATUS" | jq -r '.data.completionRate // 0')
    OPERATOR=$(echo "$PROCUREMENT_STATUS" | jq -r '.data.operatorName // "未设置"')
    TIME=$(echo "$PROCUREMENT_STATUS" | jq -r '.data.completedTime // "未完成"')
    
    echo ""
    echo "================================"
    echo "📈 采购状态摘要:"
    echo "   完成状态: $COMPLETED"
    echo "   完成率: $RATE%"
    echo "   操作人: $OPERATOR"
    echo "   完成时间: $TIME"
    echo "================================"
else
    echo "$PROCUREMENT_STATUS"
fi

echo ""
echo "✅ API测试完成！"
echo ""
echo "🌐 前端测试步骤:"
echo "1. 打开浏览器: http://localhost:5173"
echo "2. 登录系统"
echo "3. 进入生产订单页面"
echo "4. 点击订单 $ORDER_NO 的【采购】按钮"
echo "5. 查看采购节点标题栏是否显示完成状态、操作人和时间"
echo ""
