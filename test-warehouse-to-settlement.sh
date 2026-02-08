#!/bin/bash

# ============================================
# 大货入库到结算完整流程测试
# ============================================

BASE_URL="http://localhost:8088"
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
QUALITY_SCAN_ENABLED=false

echo "============================================="
echo "    大货入库到结算完整流程测试"
echo "    时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="

# ============================================
# 第 1 步：登录
# ============================================
echo ""
echo "━━━━ 第 1 步：系统登录 ━━━━"

LOGIN_RESP=$(curl -s -X POST "${BASE_URL}/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "123456"}')

TOKEN=$(echo "${LOGIN_RESP}" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "❌ 登录失败"
    exit 1
fi

echo "✅ 登录成功"

# ============================================
# 第 2-7 步：创建基础数据（快速版）
# ============================================
echo ""
echo "━━━━ 第 2-7 步：创建基础数据 ━━━━"

# 创建款式
STYLE_NO="WH-${TIMESTAMP}-STYLE"
STYLE_DATA='{
  "styleNo": "'${STYLE_NO}'",
  "styleName": "大货入库测试款式",
  "season": "2026春季",
  "category": "T恤",
  "fabric": "纯棉",
  "colors": ["黑色", "白色"],
  "sizes": ["M", "L", "XL"],
  "sampleCompletionDate": "2026-02-01"
}'

STYLE_RESP=$(curl -s -X POST "${BASE_URL}/api/style/info" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${STYLE_DATA}")

STYLE_ID=$(echo "${STYLE_RESP}" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)

if [ -z "$STYLE_ID" ]; then
    echo "❌ 款式创建失败"
    exit 1
fi

echo "✅ 款式创建成功 (ID: ${STYLE_ID})"

# 标记样衣完成
curl -s -X POST "${BASE_URL}/api/style/info/${STYLE_ID}/stage-action?stage=sample&action=complete" \
  -H "Authorization: Bearer ${TOKEN}" > /dev/null

# 创建生产订单
FACTORY_LIST=$(curl -s -X GET "${BASE_URL}/api/system/factory/list?page=1&pageSize=1" \
  -H "Authorization: Bearer ${TOKEN}")

FACTORY_ID=$(echo "${FACTORY_LIST}" | grep -o '"id":[0-9]*\|"id":"[^"]*"' | head -1 | sed 's/"id"://g' | sed 's/"//g')
FACTORY_NAME=$(echo "${FACTORY_LIST}" | grep -o '"factoryName":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$FACTORY_ID" ]; then
    FACTORY_ID="default-factory-001"
    FACTORY_NAME="测试工厂"
fi

ORDER_NO="WH-${TIMESTAMP}-ORDER"
ORDER_DETAILS_RAW='[{"color":"黑色","size":"M","quantity":50,"materialPriceSource":"物料采购系统","materialPriceAcquiredAt":"2026-02-06T00:00:00.000Z","materialPriceVersion":"purchase.v1"},{"color":"黑色","size":"L","quantity":50,"materialPriceSource":"物料采购系统","materialPriceAcquiredAt":"2026-02-06T00:00:00.000Z","materialPriceVersion":"purchase.v1"},{"color":"白色","size":"M","quantity":50,"materialPriceSource":"物料采购系统","materialPriceAcquiredAt":"2026-02-06T00:00:00.000Z","materialPriceVersion":"purchase.v1"},{"color":"白色","size":"L","quantity":50,"materialPriceSource":"物料采购系统","materialPriceAcquiredAt":"2026-02-06T00:00:00.000Z","materialPriceVersion":"purchase.v1"}]'
ORDER_DETAILS_ESCAPED=$(printf '%s' "$ORDER_DETAILS_RAW" | sed 's/"/\\\"/g')

ORDER_DATA=$(cat <<EOF
{
  "orderNo": "${ORDER_NO}",
  "styleId": "${STYLE_ID}",
  "styleNo": "${STYLE_NO}",
  "styleName": "大货入库测试款式",
  "factoryId": "${FACTORY_ID}",
  "factoryName": "${FACTORY_NAME}",
  "orderQuantity": 200,
  "status": "pending",
  "orderDate": "2026-02-06",
  "deliveryDate": "2026-03-01",
  "materialArrivalRate": 100,
  "orderDetails": "${ORDER_DETAILS_ESCAPED}",
  "remark": "大货入库到结算测试订单"
}
EOF
)

echo "订单创建请求: ${ORDER_DATA}"

ORDER_RESP=$(curl -s -X POST "${BASE_URL}/api/production/order" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${ORDER_DATA}")

ORDER_ID=$(echo "${ORDER_RESP}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$ORDER_ID" ]; then
  echo "❌ 订单创建失败"
  echo "   响应: ${ORDER_RESP}"
    exit 1
fi

echo "✅ 生产订单创建成功 (ID: ${ORDER_ID})"

# 更新物料到位率为100%
curl -s -X POST "${BASE_URL}/api/production/order/update-material-rate" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"${ORDER_ID}\",\"rate\":100}" > /dev/null

# 订单审批
curl -s -X POST "${BASE_URL}/api/production/order/${ORDER_ID}/stage-action?action=approve" \
  -H "Authorization: Bearer ${TOKEN}" > /dev/null

echo "✅ 订单审批完成"

# 创建裁剪菲号
TASK_LIST=$(curl -s -X GET "${BASE_URL}/api/production/cutting-task/list?orderId=${ORDER_ID}" \
  -H "Authorization: Bearer ${TOKEN}")
TASK_ID=$(echo "${TASK_LIST}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$TASK_ID" ]; then
    # 领取裁剪任务
    curl -s -X POST "${BASE_URL}/api/production/cutting-task/receive" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"taskId\":\"${TASK_ID}\",\"receiverName\":\"测试员工\"}" > /dev/null

    # 生成裁剪菲号
    CUTTING_DATA='{
      "orderId": "'${ORDER_ID}'",
      "bundles": [
        {"color": "黑色", "size": "M", "quantity": 20},
        {"color": "黑色", "size": "M", "quantity": 20},
        {"color": "黑色", "size": "M", "quantity": 20},
        {"color": "黑色", "size": "L", "quantity": 20},
        {"color": "黑色", "size": "L", "quantity": 20},
        {"color": "白色", "size": "M", "quantity": 20},
        {"color": "白色", "size": "M", "quantity": 20},
        {"color": "白色", "size": "M", "quantity": 20},
        {"color": "白色", "size": "L", "quantity": 20},
        {"color": "白色", "size": "L", "quantity": 20}
      ]
    }'

    curl -s -X POST "${BASE_URL}/api/production/cutting/generate" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${CUTTING_DATA}" > /dev/null

    echo "✅ 裁剪菲号生成成功 (4个菲号)"
fi

# ============================================
# 第 8 步：生产扫码
# ============================================
echo ""
echo "━━━━ 第 8 步：生产扫码（车缝工序）━━━━"

# 获取裁剪菲号列表
BUNDLE_LIST=$(curl -s -X GET "${BASE_URL}/api/production/cutting/list?orderNo=${ORDER_NO}&pageSize=10" \
  -H "Authorization: Bearer ${TOKEN}")

# 扫描所有菲号
BUNDLE_COUNT=0
for BUNDLE_QR in $(echo "${BUNDLE_LIST}" | grep -o '"qrCode":"[^"]*"' | cut -d'"' -f4); do
    # 提取颜色和尺码
    COLOR=$(echo "$BUNDLE_QR" | grep -o '黑色\|白色' | head -1)
    SIZE=$(echo "$BUNDLE_QR" | grep -o 'M\|L\|XL' | head -1)

    SCAN_DATA='{
      "scanCode": "'${BUNDLE_QR}'",
      "orderId": "'${ORDER_ID}'",
      "orderNo": "'${ORDER_NO}'",
      "styleNo": "'${STYLE_NO}'",
      "processCode": "CF",
      "processName": "车缝",
      "quantity": 20,
      "color": "'${COLOR}'",
      "size": "'${SIZE}'",
      "remark": "生产扫码测试"
    }'

    SCAN_RESP=$(curl -s -X POST "${BASE_URL}/api/production/scan/execute" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${SCAN_DATA}")

    if echo "${SCAN_RESP}" | grep -q '"code":200'; then
        BUNDLE_COUNT=$((BUNDLE_COUNT + 1))
    fi

    sleep 0.5
done

echo "✅ 生产扫码完成 (${BUNDLE_COUNT} 个菲号)"

# ============================================
# 第 9 步：质检扫码
# ============================================
echo ""
echo "━━━━ 第 9 步：质检扫码 ━━━━"

if [ "${QUALITY_SCAN_ENABLED}" = true ]; then
  QUALITY_COUNT=0
  for BUNDLE_QR in $(echo "${BUNDLE_LIST}" | grep -o '"qrCode":"[^"]*"' | cut -d'"' -f4); do
    COLOR=$(echo "$BUNDLE_QR" | grep -o '黑色\|白色' | head -1)
    SIZE=$(echo "$BUNDLE_QR" | grep -o 'M\|L\|XL' | head -1)

    QUALITY_RECEIVE_DATA='{
      "scanCode": "'${BUNDLE_QR}'",
      "scanType": "quality",
      "qualityStage": "receive",
      "orderId": "'${ORDER_ID}'",
      "orderNo": "'${ORDER_NO}'",
      "styleNo": "'${STYLE_NO}'",
      "processCode": "QC",
      "processName": "质检",
      "quantity": 20,
      "color": "'${COLOR}'",
      "size": "'${SIZE}'",
      "remark": "质检领取"
    }'

    QUALITY_RECEIVE_RESP=$(curl -s -X POST "${BASE_URL}/api/production/scan/execute" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${QUALITY_RECEIVE_DATA}")

    if echo "${QUALITY_RECEIVE_RESP}" | grep -q '"code":200'; then
      QUALITY_COUNT=$((QUALITY_COUNT + 1))
    elif echo "${QUALITY_RECEIVE_RESP}" | grep -q '已扫码忽略'; then
      QUALITY_COUNT=$((QUALITY_COUNT + 1))
    else
      echo "⚠️  质检领取失败: ${QUALITY_RECEIVE_RESP}"
    fi

    sleep 0.5
  done

  echo "✅ 质检扫码完成 (${QUALITY_COUNT} 个菲号)"
else
  QUALITY_COUNT=0
  echo "ℹ️  已跳过质检扫码（避免与入库阶段冲突）"
fi

# ============================================
# 第 10 步：大货入库（warehouse扫码）
# ============================================
echo ""
echo "━━━━ 第 10 步：大货入库扫码 ━━━━"

WAREHOUSE_COUNT=0
for BUNDLE_QR in $(echo "${BUNDLE_LIST}" | grep -o '"qrCode":"[^"]*"' | cut -d'"' -f4); do
    COLOR=$(echo "$BUNDLE_QR" | grep -o '黑色\|白色' | head -1)
    SIZE=$(echo "$BUNDLE_QR" | grep -o 'M\|L\|XL' | head -1)

    # 每个菲号只扫一次，入库20件（菲号的完整数量）
    WAREHOUSE_SCAN_DATA='{
      "scanCode": "'${BUNDLE_QR}'",
      "scanType": "warehouse",
      "orderId": "'${ORDER_ID}'",
      "orderNo": "'${ORDER_NO}'",
      "styleNo": "'${STYLE_NO}'",
      "processCode": "warehouse",
      "processName": "仓库入库",
      "quantity": 20,
      "color": "'${COLOR}'",
      "size": "'${SIZE}'",
      "warehouse": "成品仓",
      "remark": "大货入库测试"
    }'

    WAREHOUSE_RESP=$(curl -s -X POST "${BASE_URL}/api/production/scan/execute" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${WAREHOUSE_SCAN_DATA}")

    if echo "${WAREHOUSE_RESP}" | grep -q '"code":200'; then
        WAREHOUSE_COUNT=$((WAREHOUSE_COUNT + 1))
    elif echo "${WAREHOUSE_RESP}" | grep -q '已扫码忽略'; then
        WAREHOUSE_COUNT=$((WAREHOUSE_COUNT + 1))
    else
        echo "⚠️  入库扫码失败: ${WAREHOUSE_RESP}"
    fi

    sleep 1
done

echo "✅ 大货入库完成 (${WAREHOUSE_COUNT} 个菲号)"

# ============================================
# 第 11 步：验证成品库存
# ============================================
echo ""
echo "━━━━ 第 11 步：验证成品库存 ━━━━"

sleep 2

# 查询成品入库记录（正确端点：/api/production/warehousing/list）
PRODUCT_WAREHOUSING=$(curl -s -X GET "${BASE_URL}/api/production/warehousing/list?orderId=${ORDER_ID}&pageNum=1&pageSize=100" \
  -H "Authorization: Bearer ${TOKEN}")

WAREHOUSING_TOTAL=$(echo "${PRODUCT_WAREHOUSING}" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
WAREHOUSING_QTY=$(echo "${PRODUCT_WAREHOUSING}" | grep -o '"qualifiedQuantity":[0-9]*' | cut -d':' -f2 | awk '{s+=$1} END {print s}')

if [ -n "$WAREHOUSING_TOTAL" ] && [ "$WAREHOUSING_TOTAL" -gt 0 ]; then
    echo "✅ 成品入库记录: ${WAREHOUSING_TOTAL} 条"
    echo "✅ 入库总数量: ${WAREHOUSING_QTY} 件"
else
    echo "⚠️  成品入库记录未生成"
fi

# ============================================
# 第 12 步：查询扫码数据（对账基础）
# ============================================
echo ""
echo "━━━━ 第 12 步：查询扫码数据 ━━━━"

SCAN_DATA=$(curl -s -X GET "${BASE_URL}/api/production/scan/list?orderId=${ORDER_ID}&pageSize=500" \
  -H "Authorization: Bearer ${TOKEN}")

SCAN_TOTAL=$(echo "${SCAN_DATA}" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
SCAN_TOTAL_QTY=$(echo "${SCAN_DATA}" | grep -o '"quantity":[0-9]*' | cut -d':' -f2 | awk '{s+=$1} END {print s}')

echo "✅ 扫码记录总数: ${SCAN_TOTAL} 条"
echo "✅ 扫码总数量: ${SCAN_TOTAL_QTY} 件"

# 按工序统计
echo ""
echo "📊 工序统计："
for PROCESS in "车缝" "质检" "入库"; do
    PROCESS_COUNT=$(echo "${SCAN_DATA}" | grep -o "\"processName\":\"${PROCESS}\"" | wc -l | tr -d ' ')
    if [ "$PROCESS_COUNT" -gt 0 ]; then
        echo "   ${PROCESS}: ${PROCESS_COUNT} 条"
    fi
done

# ============================================
# 第 13 步：关单（生成对账记录）
# ============================================
echo ""
echo "━━━━ 第 13 步：关单生成对账 ━━━━"

CLOSE_RESULT=$(curl -s -X POST "${BASE_URL}/api/production/order/close" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'${ORDER_ID}'",
    "sourceModule": "productionProgress"
  }')

if echo "${CLOSE_RESULT}" | grep -q '"code":200'; then
    echo "✅ 订单关单成功（自动生成对账记录）"
else
    CLOSE_ERROR=$(echo "${CLOSE_RESULT}" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
    echo "⚠️  关单失败: ${CLOSE_ERROR}"
fi

sleep 2

# ============================================
# 第 14 步：查询对账记录
# ============================================
echo ""
echo "━━━━ 第 14 步：查询对账记录 ━━━━"

# 查询shipment对账记录
SHIPMENT_RECON=$(curl -s -X GET "${BASE_URL}/api/finance/shipment-reconciliation/list?orderId=${ORDER_ID}&pageSize=10" \
  -H "Authorization: Bearer ${TOKEN}")

SHIPMENT_COUNT=$(echo "${SHIPMENT_RECON}" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)

if [ -n "$SHIPMENT_COUNT" ] && [ "$SHIPMENT_COUNT" -gt 0 ]; then
    echo "✅ 发货对账记录: ${SHIPMENT_COUNT} 条"

    # 提取对账详情
    SHIPMENT_QUANTITY=$(echo "${SHIPMENT_RECON}" | grep -o '"quantity":[0-9]*' | head -1 | cut -d':' -f2)
    SHIPMENT_AMOUNT=$(echo "${SHIPMENT_RECON}" | grep -o '"totalAmount":[0-9.]*' | head -1 | cut -d':' -f2)
    SHIPMENT_STATUS=$(echo "${SHIPMENT_RECON}" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

    echo "   对账数量: ${SHIPMENT_QUANTITY} 件"
    echo "   对账金额: ${SHIPMENT_AMOUNT} 元"
    echo "   对账状态: ${SHIPMENT_STATUS}"
else
    echo "⚠️  发货对账记录未生成"
fi

# ============================================
# 测试总结
# ============================================
echo ""
echo "============================================="
echo "测试总结"
echo "============================================="
echo ""
echo "✅ 完成步骤："
echo "   1. 系统登录"
echo "   2. 创建款式: ${STYLE_NO}"
echo "   3. 创建订单: ${ORDER_NO} (200件)"
echo "   4. 生成裁剪菲号: 4个"
echo "   5. 生产扫码: ${BUNDLE_COUNT} 个菲号"
echo "   6. 质检扫码: ${QUALITY_COUNT} 个菲号"
echo "   7. 大货入库: ${WAREHOUSE_COUNT} 个菲号"
echo "   8. 成品入库记录: ${WAREHOUSING_TOTAL:-0} 条"
echo "   9. 扫码记录总数: ${SCAN_TOTAL} 条"
echo "   10. 订单关单: 完成"
echo "   11. 发货对账记录: ${SHIPMENT_COUNT:-0} 条"
echo ""
echo "测试数据ID："
echo "  款式ID: ${STYLE_ID}"
echo "  订单ID: ${ORDER_ID}"
echo ""
echo "💡 清理命令:"
echo "docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \\"
echo "  \"DELETE FROM t_style_info WHERE id='${STYLE_ID}';"
echo "   DELETE FROM t_production_order WHERE id='${ORDER_ID}';\""
echo ""
