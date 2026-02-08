#!/bin/bash
# 快速初始化订单 PO20260206001 的工序跟踪记录

set -e

API_BASE_URL="http://localhost:8088/api"
ORDER_NO="PO20260206001"

echo "=========================================="
echo "订单 ${ORDER_NO} 工序跟踪快速初始化"
echo "=========================================="

# 检查后端服务
echo -e "\n1️⃣ 检查后端服务..."
if ! curl -s --connect-timeout 3 "${API_BASE_URL}/system/health" > /dev/null 2>&1; then
  echo "❌ 后端服务未运行，请先启动："
  echo "   ./dev-public.sh"
  exit 1
fi
echo "✅ 后端服务正常"

# 查询订单
echo -e "\n2️⃣ 查询订单..."
ORDER_RESPONSE=$(curl -s "${API_BASE_URL}/production/order/list" \
  -H "Content-Type: application/json" \
  -d "{\"orderNo\": \"${ORDER_NO}\"}" 2>/dev/null || echo '{"data":{"records":[]}}')

ORDER_ID=$(echo "$ORDER_RESPONSE" | jq -r '.data.records[0].id // empty' 2>/dev/null)
ORDER_QUANTITY=$(echo "$ORDER_RESPONSE" | jq -r '.data.records[0].orderQuantity // 0' 2>/dev/null)

if [ -z "$ORDER_ID" ]; then
  echo "❌ 订单不存在：${ORDER_NO}"
  echo ""
  echo "请先创建订单："
  echo "  1. 进入「生产管理」→「生产订单」"
  echo "  2. 点击「新建订单」"
  echo "  3. 填写订单号：${ORDER_NO}"
  exit 1
fi

echo "✅ 订单存在"
echo "   订单ID: ${ORDER_ID}"
echo "   订单数量: ${ORDER_QUANTITY}件"

# 查询裁剪单
echo -e "\n3️⃣ 检查裁剪单..."
CUTTING_RESPONSE=$(curl -s "${API_BASE_URL}/production/cutting/list?productionOrderId=${ORDER_ID}&pageSize=999" 2>/dev/null || echo '{"data":{"records":[]}}')

BUNDLE_COUNT=$(echo "$CUTTING_RESPONSE" | jq '.data.records | length' 2>/dev/null || echo "0")

if [ "$BUNDLE_COUNT" -eq 0 ]; then
  echo "⚠️  该订单还没有裁剪单（菲号）"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "请按以下步骤生成裁剪单："
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📋 步骤1：进入裁剪管理"
  echo "   路径：生产管理 → 裁剪管理"
  echo ""
  echo "📋 步骤2：领取订单"
  echo "   • 在列表中找到订单 ${ORDER_NO}"
  echo "   • 点击「领取」按钮"
  echo ""
  echo "📋 步骤3：分配裁剪数量"
  echo "   • 填写每个颜色尺码的数量"
  echo "   示例："
  echo "     红色-M: 100件 → 生成2个菲号（每个50件）"
  echo "     红色-L: 150件 → 生成3个菲号（每个50件）"
  echo ""
  echo "📋 步骤4：生成菲号"
  echo "   • 点击「生成菲号」按钮"
  echo "   • 系统会自动："
  echo "     ✓ 创建裁剪单记录"
  echo "     ✓ 生成菲号二维码"
  echo "     ✓ 初始化工序跟踪记录 ← 这就是您要的！"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "💡 提示："
  echo "   生成菲号后，每个菲号的每个工序会自动创建独立记录"
  echo "   例如：5个菲号 × 4个工序 = 20条工序跟踪记录"
  echo ""
  exit 0
fi

echo "✅ 已生成 ${BUNDLE_COUNT} 个菲号"

# 显示菲号列表
echo ""
echo "菲号列表："
echo "$CUTTING_RESPONSE" | jq -r '.data.records[] | "  菲号\(.bundleNo): \(.color) / \(.size) (\(.quantity)件)"' 2>/dev/null | head -10

if [ "$BUNDLE_COUNT" -gt 10 ]; then
  echo "  ... 还有 $((BUNDLE_COUNT - 10)) 个菲号"
fi

# 查询工序跟踪记录
echo -e "\n4️⃣ 检查工序跟踪记录..."
TRACKING_RESPONSE=$(curl -s "${API_BASE_URL}/production/process-tracking/order/${ORDER_ID}" 2>/dev/null || echo '{"data":[]}')

TRACKING_COUNT=$(echo "$TRACKING_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")

if [ "$TRACKING_COUNT" -eq 0 ]; then
  echo "⚠️  工序跟踪记录为空"
  echo ""
  echo "正在执行初始化..."

  INIT_RESPONSE=$(curl -s -X POST \
    "${API_BASE_URL}/production/process-tracking/initialize/${ORDER_ID}" \
    2>/dev/null || echo '{"code":500}')

  INIT_CODE=$(echo "$INIT_RESPONSE" | jq '.code' 2>/dev/null || echo "500")

  if [ "$INIT_CODE" -eq 200 ]; then
    NEW_COUNT=$(echo "$INIT_RESPONSE" | jq '.data' 2>/dev/null || echo "0")
    echo "✅ 初始化成功！生成 ${NEW_COUNT} 条工序跟踪记录"

    # 重新查询
    TRACKING_RESPONSE=$(curl -s "${API_BASE_URL}/production/process-tracking/order/${ORDER_ID}" 2>/dev/null || echo '{"data":[]}')
    TRACKING_COUNT=$(echo "$TRACKING_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
  else
    ERROR_MSG=$(echo "$INIT_RESPONSE" | jq -r '.message // "未知错误"' 2>/dev/null)
    echo "❌ 初始化失败：${ERROR_MSG}"
    echo ""
    echo "可能原因："
    echo "  1. 订单没有配置工序节点（progressWorkflowJson为空）"
    echo "  2. 权限不足"
    echo "  3. 数据库连接问题"
    exit 1
  fi
else
  echo "✅ 已有 ${TRACKING_COUNT} 条工序跟踪记录"
fi

# 分析记录结构
echo -e "\n5️⃣ 工序跟踪记录详情："
echo ""

# 按菲号分组显示
echo "$TRACKING_RESPONSE" | jq -r '
.data
| group_by(.bundleNo)
| .[]
| "菲号 \(.[0].bundleNo) - \(.[0].color) / \(.[0].size) (\(.[0].quantity)件):
\(. | map("  • \(.processName) - 状态: \(.scanStatus)") | join("\n"))"
' 2>/dev/null | head -30

TOTAL_BUNDLES=$(echo "$TRACKING_RESPONSE" | jq '[.data | group_by(.bundleNo) | length] | .[0]' 2>/dev/null || echo "0")
TOTAL_PROCESSES=$(echo "$TRACKING_RESPONSE" | jq '[.data | group_by(.processCode) | length] | .[0]' 2>/dev/null || echo "0")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 统计汇总："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  菲号数量: ${TOTAL_BUNDLES}"
echo "  工序数量: ${TOTAL_PROCESSES}"
echo "  预期记录数: $((TOTAL_BUNDLES * TOTAL_PROCESSES))"
echo "  实际记录数: ${TRACKING_COUNT}"

# 计算扫码进度
SCANNED_COUNT=$(echo "$TRACKING_RESPONSE" | jq '[.data[] | select(.scanStatus == "scanned")] | length' 2>/dev/null || echo "0")
PENDING_COUNT=$(echo "$TRACKING_RESPONSE" | jq '[.data[] | select(.scanStatus == "pending")] | length' 2>/dev/null || echo "0")

echo ""
echo "  扫码状态:"
echo "    • 已扫码: ${SCANNED_COUNT} 条"
echo "    • 待扫码: ${PENDING_COUNT} 条"

if [ "$TRACKING_COUNT" -eq $((TOTAL_BUNDLES * TOTAL_PROCESSES)) ]; then
  echo ""
  echo "  ✅ 记录完整：每个菲号的每个工序都有独立记录"
else
  echo ""
  echo "  ⚠️  记录数量不符合预期"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 查看指引
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📖 如何在界面查看："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "方法1：通过订单详情"
echo "  1. 进入「生产管理」→「生产订单」"
echo "  2. 点击订单号 ${ORDER_NO}"
echo "  3. 点击任意工序节点（进度球）"
echo "  4. 切换到「工序跟踪（工资结算）」Tab"
echo "  5. 看到每个菲号的每个工序都是独立的行 ✨"
echo ""
echo "方法2：通过生产进度详情"
echo "  1. 进入「生产管理」→「生产进度详情」"
echo "  2. 找到订单 ${ORDER_NO}"
echo "  3. 点击工序节点打开详情"
echo "  4. 查看「工序跟踪（工资结算）」Tab"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "✅ 初始化完成！"
echo ""
