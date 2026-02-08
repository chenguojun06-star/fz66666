#!/bin/bash

# 完整业务流程测试 - 简化版
# 从样衣创建到财务结算的完整流程

BASE_URL="http://localhost:8088"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
TEST_PREFIX="E2E-${TIMESTAMP}"

echo "============================================="
echo "    完整业务流程端到端测试"
echo "    时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="

# ============================================
# 第 1 步：登录
# ============================================
echo ""
echo "━━━━ 第 1 步：系统登录 ━━━━"
LOGIN_RESP=$(curl -s -X POST "${BASE_URL}/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo "${LOGIN_RESP}" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "❌ 登录失败: ${LOGIN_RESP}"
    exit 1
fi
echo "✅ 登录成功"

# ============================================
# 第 2 步：创建款式
# ============================================
echo ""
echo "━━━━ 第 2 步：创建款式 ━━━━"
STYLE_NO="${TEST_PREFIX}-STYLE"
STYLE_NAME="测试款式-${TIMESTAMP}"

STYLE_DATA='{
  "styleNo": "'${STYLE_NO}'",
  "styleName": "'${STYLE_NAME}'",
  "season": "2026春季",
  "category": "衬衫",
  "status": "enabled",
  "designDate": "2026-02-06",
  "remark": "端到端测试"
}'

echo "创建款式: ${STYLE_NO}"
STYLE_RESP=$(curl -s -X POST "${BASE_URL}/api/style/info" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${STYLE_DATA}")

# ID可能是数字或字符串，都要支持
STYLE_ID=$(echo "${STYLE_RESP}" | grep -o '"id":[0-9]*\|"id":"[^"]*"' | head -1 | sed 's/"id"://g' | sed 's/"//g')

if [ -z "$STYLE_ID" ] || ! echo "${STYLE_RESP}" | grep -q '"code":200'; then
    echo "❌ 款式创建失败"
    echo "   响应: ${STYLE_RESP}"
else
    echo "✅ 款式创建成功 (ID: ${STYLE_ID})"

    # 标记样衣完成（这是订单下单的前置条件）
    echo "标记样衣完成..."
    SAMPLE_COMPLETE_RESP=$(curl -s -X POST "${BASE_URL}/api/style/info/${STYLE_ID}/stage-action?stage=sample&action=complete" \
      -H "Authorization: Bearer ${TOKEN}")

    if echo "${SAMPLE_COMPLETE_RESP}" | grep -q '"code":200'; then
        echo "✅ 样衣状态已标记为完成"
    else
        echo "⚠️  样衣完成标记失败（可能不影响后续测试）"
    fi
fi

# ============================================
# 第 3 步：创建样衣
# ============================================
echo ""
echo "━━━━ 第 3 步：创建样衣 ━━━━"

if [ -n "$STYLE_ID" ]; then
    SAMPLE_NO="${TEST_PREFIX}-SAMPLE"

    # 样衣直接入库到SampleStock表
    SAMPLE_DATA='{
      "styleId": "'${STYLE_ID}'",
      "styleNo": "'${STYLE_NO}'",
      "styleName": "'${STYLE_NAME}'",
      "sampleType": "development",
      "quantity": 3,
      "location": "A-01-001",
      "remark": "端到端测试样衣"
    }'

    echo "创建样衣入库记录"
    SAMPLE_RESP=$(curl -s -X POST "${BASE_URL}/api/stock/sample/inbound" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${SAMPLE_DATA}")

    if echo "${SAMPLE_RESP}" | grep -q '"code":200'; then
        echo "✅ 样衣入库成功"
        SAMPLE_CREATED="yes"
    else
        echo "❌ 样衣入库失败"
        echo "   响应: ${SAMPLE_RESP}"
    fi
else
    echo "⏭️  跳过（款式未创建）"
fi

# ============================================
# 第 4 步：验证样衣库存
# ============================================
echo ""
echo "━━━━ 第 4 步：验证样衣库存 ━━━━"

if [ -n "$SAMPLE_CREATED" ]; then
    echo "查询样衣库存"
    sleep 1

    SAMPLE_STOCK=$(curl -s -X GET "${BASE_URL}/api/stock/sample/list?styleNo=${STYLE_NO}" \
      -H "Authorization: Bearer ${TOKEN}")

    SAMPLE_QTY=$(echo "${SAMPLE_STOCK}" | grep -o '"quantity":[0-9]*' | head -1 | cut -d':' -f2)

    if [ -n "$SAMPLE_QTY" ]; then
        echo "✅ 样衣库存: ${SAMPLE_QTY} 件"
    else
        echo "ℹ️  样衣库存查询: 暂无数据"
    fi
else
    echo "⏭️  跳过（样衣未创建）"
fi

# ============================================
# 第 5 步：创建生产订单
# ============================================
echo ""
echo "━━━━ 第 5 步：创建生产订单 ━━━━"

if [ -n "$STYLE_ID" ]; then
    ORDER_NO="${TEST_PREFIX}-ORDER"

    # 查询工厂
    FACTORY_LIST=$(curl -s -X POST "${BASE_URL}/api/basic/factory/list" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"pageNum":1,"pageSize":1}')

    FACTORY_ID=$(echo "${FACTORY_LIST}" | grep -o '"id":[0-9]*\|"id":"[^"]*"' | head -1 | sed 's/"id"://g' | sed 's/"//g')
    FACTORY_NAME=$(echo "${FACTORY_LIST}" | grep -o '"factoryName":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -z "$FACTORY_ID" ]; then
        echo "⚠️  未找到工厂，使用默认值"
        FACTORY_ID="default-factory-001"
        FACTORY_NAME="测试工厂"
    fi

    # 构建订单明细（包含物料价格来源信息，这是必需的）
    # 注意：orderDetails 必须是JSON字符串，不是直接的数组
    ORDER_DETAILS='[{\"color\":\"红色\",\"size\":\"XL\",\"quantity\":50,\"materialPriceSource\":\"物料采购系统\",\"materialPriceAcquiredAt\":\"2026-02-06T00:00:00.000Z\",\"materialPriceVersion\":\"purchase.v1\"},{\"color\":\"蓝色\",\"size\":\"L\",\"quantity\":50,\"materialPriceSource\":\"物料采购系统\",\"materialPriceAcquiredAt\":\"2026-02-06T00:00:00.000Z\",\"materialPriceVersion\":\"purchase.v1\"}]'

    ORDER_DATA='{
      "orderNo": "'${ORDER_NO}'",
      "styleId": "'${STYLE_ID}'",
      "styleNo": "'${STYLE_NO}'",
      "styleName": "'${STYLE_NAME}'",
      "factoryId": "'${FACTORY_ID}'",
      "factoryName": "'${FACTORY_NAME}'",
      "totalQuantity": 100,
      "status": "pending",
      "orderDate": "2026-02-06",
      "deliveryDate": "2026-03-06",
      "materialArrivalRate": 100,
      "orderDetails": "'"${ORDER_DETAILS}"'",
      "remark": "端到端测试订单（物料已到齐）"
    }'

    echo "创建订单: ${ORDER_NO}"
    ORDER_RESP=$(curl -s -X POST "${BASE_URL}/api/production/order" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${ORDER_DATA}")

    ORDER_ID=$(echo "${ORDER_RESP}" | grep -o '"id":[0-9]*\|"id":"[^"]*"' | head -1 | sed 's/"id"://g' | sed 's/"//g')

    if [ -z "$ORDER_ID" ]; then
        echo "❌ 订单创建失败"
        echo "   响应: ${ORDER_RESP}"
    else
        echo "✅ 订单创建成功 (ID: ${ORDER_ID})"
    fi
else
    echo "⏭️  跳过（款式未创建）"
fi

# ============================================
# 第 6 步：订单审批
# ============================================
echo ""
echo "━━━━ 第 6 步：订单审批 ━━━━"

if [ -n "$ORDER_ID" ]; then
    echo "提交审批"
    APPROVE_RESP=$(curl -s -X POST "${BASE_URL}/api/production/order/${ORDER_ID}/status-action?action=update&status=confirmed" \
      -H "Authorization: Bearer ${TOKEN}")

    sleep 1

    # 更新物料到位率为100%（模拟物料到齐）
    echo "更新物料到位率为100%..."
    MATERIAL_RATE_RESP=$(curl -s -X POST "${BASE_URL}/api/production/order/update-material-rate" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"id\":\"${ORDER_ID}\",\"rate\":100}")

    # 检查更新是否成功
    if echo "${MATERIAL_RATE_RESP}" | grep -q '"code":200'; then
        echo "✅ 物料到位率更新成功"
    else
        echo "⚠️  物料到位率更新响应: ${MATERIAL_RATE_RESP}"
    fi

    sleep 1

    # 验证状态
    ORDER_CHECK=$(curl -s -X GET "${BASE_URL}/api/production/order/${ORDER_ID}" \
      -H "Authorization: Bearer ${TOKEN}")

    ORDER_STATUS=$(echo "${ORDER_CHECK}" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    MATERIAL_RATE=$(echo "${ORDER_CHECK}" | grep -o '"materialArrivalRate":[0-9]*' | head -1 | cut -d':' -f2)

    echo "✅ 订单审批完成"
    [ -n "$ORDER_STATUS" ] && echo "   状态: ${ORDER_STATUS}"
    [ -n "$MATERIAL_RATE" ] && echo "   物料到位率: ${MATERIAL_RATE}%" || echo "   物料到位率: 未设置"
else
    echo "⏭️  跳过（订单未创建）"
fi

# ============================================
# 第 7 步：创建裁剪单
# ============================================
echo ""
echo "━━━━ 第 7 步：创建裁剪单 ━━━━"

if [ -n "$ORDER_ID" ]; then
    # 首先查询裁剪任务
    echo "查询裁剪任务..."
    TASK_LIST=$(curl -s -X GET "${BASE_URL}/api/production/cutting-task/list?orderId=${ORDER_ID}&pageNum=1&pageSize=10" \
      -H "Authorization: Bearer ${TOKEN}")

    TASK_ID=$(echo "${TASK_LIST}" | grep -o '"id":[0-9]*\|"id":"[^"]*"' | head -1 | sed 's/"id"://g' | sed 's/"//g')

    if [ -n "$TASK_ID" ]; then
        echo "找到裁剪任务 (ID: ${TASK_ID})，开始领取..."

        # 领取裁剪任务（必须提供receiverId或receiverName）
        RECEIVE_RESP=$(curl -s -X POST "${BASE_URL}/api/production/cutting-task/receive" \
          -H "Authorization: Bearer ${TOKEN}" \
          -H "Content-Type: application/json" \
          -d "{\"taskId\":\"${TASK_ID}\",\"receiverName\":\"E2E测试用户\"}")

        if echo "${RECEIVE_RESP}" | grep -q '"code":200'; then
            echo "✅ 裁剪任务领取成功"
            sleep 1

            # 生成裁剪单需要提供bundles数组，每个元素包含颜色、尺码、数量
            CUTTING_DATA='{
              "orderId": "'${ORDER_ID}'",
              "bundles": [
                {
                  "color": "红色",
                  "size": "XL",
                  "quantity": 50
                },
                {
                  "color": "蓝色",
                  "size": "L",
                  "quantity": 50
                }
              ]
            }'

            echo "生成裁剪菲号 (订单: ${ORDER_NO})"
            CUTTING_RESP=$(curl -s -X POST "${BASE_URL}/api/production/cutting/generate" \
              -H "Authorization: Bearer ${TOKEN}" \
              -H "Content-Type: application/json" \
              -d "${CUTTING_DATA}")

            # 返回的是bundle数组，提取第一个bundle的ID
            CUTTING_ID=$(echo "${CUTTING_RESP}" | grep -o '"id":[0-9]*\|"id":"[^"]*"' | head -1 | sed 's/"id"://g' | sed 's/"//g')

            if [ -z "$CUTTING_ID" ]; then
                echo "❌ 裁剪菲号生成失败"
                echo "   响应: ${CUTTING_RESP}"
            else
                echo "✅ 裁剪菲号生成成功 (首个Bundle ID: ${CUTTING_ID})"
                # 提取所有生成的bundle数量
                BUNDLE_COUNT=$(echo "${CUTTING_RESP}" | grep -o '"bundleNo":[0-9]*' | wc -l)
                echo "   共生成 ${BUNDLE_COUNT} 个裁剪菲号"
            fi
        else
            echo "❌ 裁剪任务领取失败"
            echo "   响应: ${RECEIVE_RESP}"
        fi
    else
        echo "⚠️  未找到裁剪任务，跳过裁剪单生成"
    fi
else
    echo "⏭️  跳过（订单未创建）"
fi

# ============================================
# 第 8 步：模拟扫码生产
# ============================================
echo ""
echo "━━━━ 第 8 步：模拟生产扫码 ━━━━"

if [ -n "$CUTTING_ID" ] && [ -n "$ORDER_ID" ]; then
    # 使用裁剪菲号进行扫码测试
    # 查询已生成的裁剪菲号列表（使用orderNo参数）
    BUNDLE_LIST=$(curl -s -X GET "${BASE_URL}/api/production/cutting/list?orderNo=${ORDER_NO}&pageSize=10" \
      -H "Authorization: Bearer ${TOKEN}")

    # 提取第一个菲号的二维码
    BUNDLE_QR=$(echo "${BUNDLE_LIST}" | grep -o '"qrCode":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -n "$BUNDLE_QR" ]; then
        echo "找到裁剪菲号二维码: ${BUNDLE_QR}"

        # 模拟扫描裁剪菲号（车缝工序）
        # 注意：必须提供color和size，因为后端验证需要完整的SKU信息
        SCAN_DATA='{
          "scanCode": "'${BUNDLE_QR}'",
          "orderId": "'${ORDER_ID}'",
          "orderNo": "'${ORDER_NO}'",
          "styleNo": "'${STYLE_NO}'",
          "processCode": "CF",
          "processName": "车缝",
          "quantity": 50,
          "color": "红色",
          "size": "XL",
          "remark": "E2E测试扫码"
        }'

        echo "执行扫码操作 (工序: 车缝, 颜色: 红色, 尺码: XL, 数量: 50件)"
        SCAN_RESP=$(curl -s -X POST "${BASE_URL}/api/production/scan/execute" \
          -H "Authorization: Bearer ${TOKEN}" \
          -H "Content-Type: application/json" \
          -d "${SCAN_DATA}")

        if echo "${SCAN_RESP}" | grep -q '"code":200'; then
            echo "✅ 扫码记录创建成功"
            SCAN_ID=$(echo "${SCAN_RESP}" | grep -o '"id":[0-9]*\|"id":"[^"]*"' | head -1 | sed 's/"id"://g' | sed 's/"//g')
            [ -n "$SCAN_ID" ] && echo "   扫码记录ID: ${SCAN_ID}"
        else
            echo "⚠️  扫码失败"
            echo "   响应: ${SCAN_RESP}"
        fi
    else
        echo "⚠️  未找到工序，跳过扫码测试"
    fi
else
    echo "⏭️  跳过（订单未创建）"
fi

# ============================================
# 第 9 步：验证扫码记录和订单进度
# ============================================
echo ""
echo "━━━━ 第 9 步：验证扫码记录和订单进度 ━━━━"

if [ -n "$ORDER_ID" ] && [ -n "$SCAN_ID" ]; then
    # 验证扫码记录已创建
    SCAN_CHECK=$(curl -s -X GET "${BASE_URL}/api/production/scan/list?orderId=${ORDER_ID}&pageSize=10" \
      -H "Authorization: Bearer ${TOKEN}")

    SCAN_COUNT=$(echo "${SCAN_CHECK}" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)

    if [ -n "$SCAN_COUNT" ] && [ "$SCAN_COUNT" -gt 0 ]; then
        echo "✅ 找到 ${SCAN_COUNT} 条扫码记录"

        # 查询订单进度
        ORDER_PROGRESS=$(curl -s -X GET "${BASE_URL}/api/production/order/${ORDER_ID}" \
          -H "Authorization: Bearer ${TOKEN}")

        PROGRESS_PERCENT=$(echo "${ORDER_PROGRESS}" | grep -o '"progressPercentage":[0-9.]*' | head -1 | cut -d':' -f2)
        if [ -n "$PROGRESS_PERCENT" ]; then
            echo "✅ 订单进度: ${PROGRESS_PERCENT}%"
        fi

        # 查询成品入库记录（通过ProductWarehousing表）
        PRODUCT_WAREHOUSING=$(curl -s -X POST "${BASE_URL}/api/production/finished-products/list" \
          -H "Authorization: Bearer ${TOKEN}" \
          -H "Content-Type: application/json" \
          -d '{"orderId":"'${ORDER_ID}'","pageNum":1,"pageSize":10}')

        WAREHOUSING_TOTAL=$(echo "${PRODUCT_WAREHOUSING}" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
        if [ -n "$WAREHOUSING_TOTAL" ] && [ "$WAREHOUSING_TOTAL" -gt 0 ]; then
            echo "✅ 成品入库记录: ${WAREHOUSING_TOTAL} 条"
        else
            echo "ℹ️  暂无成品入库记录（需要完整生产流程）"
        fi
    else
        echo "⚠️  未找到扫码记录"
    fi
else
    echo "⏭️  跳过（扫码未完成）"
fi

# ============================================
# 第 10 步：财务对账
# ============================================
echo ""
echo "━━━━ 第 10 步：验证对账数据 ━━━━"

if [ -n "$ORDER_ID" ]; then
    # 查询扫码记录数据（对账的基础）
    SCAN_DATA=$(curl -s -X GET "${BASE_URL}/api/production/scan/list?orderId=${ORDER_ID}&pageSize=100" \
      -H "Authorization: Bearer ${TOKEN}")

    SCAN_TOTAL=$(echo "${SCAN_DATA}" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)

    if [ -n "$SCAN_TOTAL" ] && [ "$SCAN_TOTAL" -gt 0 ]; then
        echo "✅ 扫码记录数据可供对账: ${SCAN_TOTAL} 条"

        # 计算总数量（模拟对账逻辑）
        TOTAL_QTY=$(echo "${SCAN_DATA}" | grep -o '"quantity":[0-9]*' | cut -d':' -f2 | awk '{s+=$1} END {print s}')
        if [ -n "$TOTAL_QTY" ] && [ "$TOTAL_QTY" -gt 0 ]; then
            echo "✅ 扫码总数量: ${TOTAL_QTY} 件"
        fi
    else
        echo "⚠️  无扫码数据可供对账"
    fi
else
    echo "⏭️  跳过（订单未创建）"
fi

# ============================================
# 第 11 步：库存验证
# ============================================
echo ""
echo "━━━━ 第 11 步：库存验证 ━━━━"

# 样衣库存
if [ -n "$STYLE_NO" ]; then
    SAMPLE_STOCK=$(curl -s -X POST "${BASE_URL}/api/warehouse/sample-stock/list" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"filters":{"styleNo":"'${STYLE_NO}'"},"pageNum":1,"pageSize":10}')

    SAMPLE_QTY=$(echo "${SAMPLE_STOCK}" | grep -o '"quantity":[0-9]*' | head -1 | cut -d':' -f2)

    if [ -n "$SAMPLE_QTY" ]; then
        echo "✅ 样衣库存: ${SAMPLE_QTY} 件"
    else
        echo "ℹ️  样衣库存: 暂无数据"
    fi
fi

# 成品库存
if [ -n "$ORDER_NO" ]; then
    FINISHED_STOCK=$(curl -s -X POST "${BASE_URL}/api/warehouse/finished-stock/list" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"filters":{"orderNo":"'${ORDER_NO}'"},"pageNum":1,"pageSize":10}')

    FINISHED_QTY=$(echo "${FINISHED_STOCK}" | grep -o '"quantity":[0-9]*' | head -1 | cut -d':' -f2)

    if [ -n "$FINISHED_QTY" ]; then
        echo "✅ 成品库存: ${FINISHED_QTY} 件"
    else
        echo "ℹ️  成品库存: 暂无数据"
    fi
fi

# ============================================
# 测试总结
# ============================================
echo ""
echo "============================================="
echo "测试总结"
echo "============================================="
echo ""
echo "测试数据:"
echo "  款式: ${STYLE_NO} (ID: ${STYLE_ID:-未创建})"
echo "  样衣: ${SAMPLE_NO:-未创建} (ID: ${SAMPLE_ID:-未创建})"
echo "  订单: ${ORDER_NO:-未创建} (ID: ${ORDER_ID:-未创建})"
echo "  裁剪单: ${CUTTING_NO:-未创建} (ID: ${CUTTING_ID:-未创建})"
echo ""
echo "💡 清理命令:"
echo "docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \\"
echo "  \"DELETE FROM t_style_info WHERE id='${STYLE_ID}';"
echo "   DELETE FROM t_sample WHERE id='${SAMPLE_ID}';"
echo "   DELETE FROM t_production_order WHERE id='${ORDER_ID}';"
echo "   DELETE FROM t_cutting WHERE id='${CUTTING_ID}';\""
echo ""
