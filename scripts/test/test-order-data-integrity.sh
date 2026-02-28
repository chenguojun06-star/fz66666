#!/bin/bash

# 数据完整性测试脚本
# 测试从"下单管理"创建订单到"我的订单"查询的完整数据流

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE_URL="http://localhost:8088/api"

echo -e "${YELLOW}===== 订单数据完整性测试 =====${NC}"
echo ""

# 1. 登录获取token
echo -e "${YELLOW}步骤1: 用户登录${NC}"
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}')

TOKEN=$(echo "$LOGIN_RESP" | jq -r '.data.token // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo -e "${RED}✗ 登录失败${NC}"
    echo "响应: $LOGIN_RESP"
    exit 1
fi
echo -e "${GREEN}✓ 登录成功${NC}"

# 2. 查询一个可用的款式
echo -e "\n${YELLOW}步骤2: 查询可用款式${NC}"
STYLE_RESP=$(curl -s -X GET "$BASE_URL/style/info/list?current=1&size=1" \
  -H "Authorization: Bearer $TOKEN")

STYLE_ID=$(echo "$STYLE_RESP" | jq -r '.data.records[0].id // empty')
STYLE_NO=$(echo "$STYLE_RESP" | jq -r '.data.records[0].styleNo // empty')
STYLE_NAME=$(echo "$STYLE_RESP" | jq -r '.data.records[0].styleName // empty')

CREATED_STYLE_ID=""
CREATED_FACTORY_ID=""

EXPECTED_MERCHANDISER="系统管理员"
EXPECTED_COMPANY="测试公司A"
EXPECTED_CATEGORY="T恤"
EXPECTED_PATTERN_MAKER="系统管理员"
EXPECTED_REMARKS="测试数据完整性"

if [ -z "$STYLE_ID" ] || [ "$STYLE_ID" = "null" ]; then
        echo -e "${YELLOW}⚠ 未找到可用款式，自动创建临时款式${NC}"
        TMP_STYLE_NO="TMPSTYLE$(date +%s)"
        CREATE_STYLE_RESP=$(curl -s -X POST "$BASE_URL/style/info" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"styleNo\":\"$TMP_STYLE_NO\",\"styleName\":\"临时测试款式\",\"category\":\"测试\",\"season\":\"2026春\",\"status\":\"draft\"}")

        CREATED_STYLE_ID=$(echo "$CREATE_STYLE_RESP" | jq -r '.data.id // empty')
        if [ -z "$CREATED_STYLE_ID" ] || [ "$CREATED_STYLE_ID" = "null" ]; then
            echo -e "${RED}✗ 自动创建临时款式失败${NC}"
            echo "响应: $CREATE_STYLE_RESP"
            exit 1
        fi

        docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \
            "UPDATE t_style_info SET sample_status='COMPLETED', status='ENABLED' WHERE id='${CREATED_STYLE_ID}';" >/dev/null 2>&1 || true

        STYLE_ID="$CREATED_STYLE_ID"
        STYLE_NO="$TMP_STYLE_NO"
        STYLE_NAME="临时测试款式"
fi
echo -e "${GREEN}✓ 找到款式: $STYLE_NO - $STYLE_NAME (ID: $STYLE_ID)${NC}"

# 3. 查询一个工厂
echo -e "\n${YELLOW}步骤3: 查询工厂信息${NC}"
FACTORY_RESP=$(curl -s -X GET "$BASE_URL/system/factory/list?page=1&pageSize=1" \
  -H "Authorization: Bearer $TOKEN")

FACTORY_ID=$(echo "$FACTORY_RESP" | jq -r '.data.records[0].id // empty')
FACTORY_NAME=$(echo "$FACTORY_RESP" | jq -r '.data.records[0].factoryName // empty')

if [ -z "$FACTORY_ID" ] || [ "$FACTORY_ID" = "null" ]; then
        echo -e "${YELLOW}⚠ 未找到可用工厂，自动创建临时工厂${NC}"
        TMP_FACTORY_CODE="TMPFAC$(date +%s)"
        CREATE_FACTORY_RESP=$(curl -s -X POST "$BASE_URL/system/factory" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"factoryCode\":\"$TMP_FACTORY_CODE\",\"factoryName\":\"临时测试工厂\",\"contactPerson\":\"测试人\",\"contactPhone\":\"13800000000\",\"status\":\"active\",\"factoryType\":\"EXTERNAL\"}")

        FACTORY_RESP=$(curl -s -X GET "$BASE_URL/system/factory/list?page=1&pageSize=20&factoryCode=$TMP_FACTORY_CODE" \
            -H "Authorization: Bearer $TOKEN")
        FACTORY_ID=$(echo "$FACTORY_RESP" | jq -r '.data.records[0].id // empty')
        FACTORY_NAME=$(echo "$FACTORY_RESP" | jq -r '.data.records[0].factoryName // empty')
        CREATED_FACTORY_ID="$FACTORY_ID"

        if [ -z "$FACTORY_ID" ] || [ "$FACTORY_ID" = "null" ]; then
            echo -e "${RED}✗ 自动创建临时工厂失败${NC}"
            echo "响应: $CREATE_FACTORY_RESP"
            exit 1
        fi
fi
echo -e "${GREEN}✓ 找到工厂: $FACTORY_NAME${NC}"

# 4. 创建订单（模拟下单管理页面的完整payload）
echo -e "\n${YELLOW}步骤4: 创建订单（完整字段）${NC}"
TIMESTAMP=$(date +%s)
ORDER_NO="TEST$TIMESTAMP"

# 构建进度节点JSON
PROGRESS_NODES='[
  {"id":"procurement","name":"采购","unitPrice":0},
  {"id":"cutting","name":"裁剪","unitPrice":8.5},
  {"id":"sewing","name":"缝制","unitPrice":25},
  {"id":"ironing","name":"整烫","unitPrice":3.5},
  {"id":"packing","name":"包装","unitPrice":2},
  {"id":"quality","name":"质检","unitPrice":1.5}
]'

# 构建订单明细（JSON字符串）
ORDER_DETAILS_JSON='[{"color":"红色","size":"M","quantity":50,"materialPriceSource":"物料采购系统","materialPriceAcquiredAt":"2026-02-15 10:00:00","materialPriceVersion":"v1"},{"color":"红色","size":"L","quantity":30,"materialPriceSource":"物料采购系统","materialPriceAcquiredAt":"2026-02-15 10:00:00","materialPriceVersion":"v1"},{"color":"蓝色","size":"M","quantity":20,"materialPriceSource":"物料采购系统","materialPriceAcquiredAt":"2026-02-15 10:00:00","materialPriceVersion":"v1"}]'

# 构建进度节点（JSON字符串）
PROGRESS_NODES_JSON='[{"id":"procurement","name":"采购","unitPrice":0},{"id":"cutting","name":"裁剪","unitPrice":8.5},{"id":"sewing","name":"缝制","unitPrice":25},{"id":"ironing","name":"整烫","unitPrice":3.5},{"id":"packing","name":"包装","unitPrice":2},{"id":"quality","name":"质检","unitPrice":1.5}]'

CREATE_RESP=$(curl -s -X POST "$BASE_URL/production/order" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"orderNo\": \"$ORDER_NO\",
    \"styleId\": $STYLE_ID,
    \"styleNo\": \"$STYLE_NO\",
    \"styleName\": \"$STYLE_NAME\",
    \"factoryId\": \"$FACTORY_ID\",
    \"factoryName\": \"$FACTORY_NAME\",
    \"merchandiser\": \"系统管理员\",
    \"company\": \"测试公司A\",
    \"productCategory\": \"T恤\",
    \"patternMaker\": \"系统管理员\",
    \"orderQuantity\": 100,
    \"orderDetails\": \"$(echo "$ORDER_DETAILS_JSON" | sed 's/"/\\"/g')\",
    \"plannedStartDate\": \"2026-02-15T09:00:00\",
    \"plannedEndDate\": \"2026-03-15T18:00:00\",
    \"progressWorkflowJson\": \"$(echo "$PROGRESS_NODES_JSON" | sed 's/"/\\"/g')\",
    \"remarks\": \"测试数据完整性\"
  }")

CREATED_ID=$(echo "$CREATE_RESP" | jq -r '.data.id // empty')
CREATED_ORDER_NO=$(echo "$CREATE_RESP" | jq -r '.data.orderNo // empty')

if [ -z "$CREATED_ID" ] || [ "$CREATED_ID" = "null" ]; then
    echo -e "${RED}✗ 订单创建失败${NC}"
    echo "响应: $CREATE_RESP"
    exit 1
fi
echo -e "${GREEN}✓ 订单创建成功: $CREATED_ORDER_NO (ID: $CREATED_ID)${NC}"

# 5. 从数据库查询订单（验证存储）
echo -e "\n${YELLOW}步骤5: 验证数据库存储${NC}"
DB_QUERY="SELECT order_no, merchandiser, company, product_category, pattern_maker, order_quantity, created_by_name, remarks FROM t_production_order WHERE id='$CREATED_ID';"

docker exec fashion-mysql-simple mysql -uroot -pchangeme -D fashion_supplychain -e "$DB_QUERY" 2>&1 | grep -v Warning | grep -v mysql

# 6. 通过API查询订单详情（模拟"我的订单"查看详情）
echo -e "\n${YELLOW}步骤6: API查询订单详情${NC}"
DETAIL_RESP=$(curl -s -X GET "$BASE_URL/production/order/detail/$CREATED_ID" \
  -H "Authorization: Bearer $TOKEN")

# 提取关键字段
API_MERCHANDISER=$(echo "$DETAIL_RESP" | jq -r '.data.merchandiser // "NULL"')
API_COMPANY=$(echo "$DETAIL_RESP" | jq -r '.data.company // "NULL"')
API_CATEGORY=$(echo "$DETAIL_RESP" | jq -r '.data.productCategory // "NULL"')
API_PATTERN_MAKER=$(echo "$DETAIL_RESP" | jq -r '.data.patternMaker // "NULL"')
API_ORDER_QTY=$(echo "$DETAIL_RESP" | jq -r '.data.orderQuantity // "NULL"')
API_REMARKS=$(echo "$DETAIL_RESP" | jq -r '.data.remarks // "NULL"')
API_ORDER_DETAILS=$(echo "$DETAIL_RESP" | jq -r '.data.orderDetails // "NULL"')
API_WORKFLOW=$(echo "$DETAIL_RESP" | jq -r '.data.progressWorkflowJson // "NULL"')

echo -e "${YELLOW}===== 字段对比 =====${NC}"
echo "跟单员: $API_MERCHANDISER"
echo "公司: $API_COMPANY"
echo "品类: $API_CATEGORY"
echo "纸样师: $API_PATTERN_MAKER"
echo "订单数量: $API_ORDER_QTY"
echo "备注: $API_REMARKS"
echo "订单明细: $(echo "$API_ORDER_DETAILS" | jq -c . 2>/dev/null || echo "$API_ORDER_DETAILS")"
echo "工序流程: $(echo "$API_WORKFLOW" | jq -c . 2>/dev/null || echo "$API_WORKFLOW")"

# 7. 验证数据完整性
echo -e "\n${YELLOW}步骤7: 数据完整性验证${NC}"
ERRORS=0

check_field() {
    local field_name=$1
    local expected=$2
    local actual=$3

    if [ "$actual" = "NULL" ] || [ -z "$actual" ]; then
        echo -e "${RED}✗ $field_name 丢失${NC} (期望: $expected, 实际: $actual)"
        ERRORS=$((ERRORS + 1))
    elif [ "$actual" != "$expected" ]; then
        echo -e "${YELLOW}⚠ $field_name 不匹配${NC} (期望: $expected, 实际: $actual)"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✓ $field_name 正确${NC}"
    fi
}

check_field "跟单员" "$EXPECTED_MERCHANDISER" "$API_MERCHANDISER"
check_field "公司" "$EXPECTED_COMPANY" "$API_COMPANY"
check_field "品类" "$EXPECTED_CATEGORY" "$API_CATEGORY"
check_field "纸样师" "$EXPECTED_PATTERN_MAKER" "$API_PATTERN_MAKER"
check_field "订单数量" "100" "$API_ORDER_QTY"
check_field "备注" "$EXPECTED_REMARKS" "$API_REMARKS"

# 检查订单明细
if [ "$API_ORDER_DETAILS" = "NULL" ] || [ -z "$API_ORDER_DETAILS" ]; then
    echo -e "${RED}✗ 订单明细丢失${NC}"
    ERRORS=$((ERRORS + 1))
else
    DETAIL_COUNT=$(echo "$API_ORDER_DETAILS" | jq '. | length' 2>/dev/null || echo "0")
    if [ "$DETAIL_COUNT" = "3" ]; then
        echo -e "${GREEN}✓ 订单明细正确 (3个SKU)${NC}"
    else
        echo -e "${RED}✗ 订单明细数量错误${NC} (期望: 3, 实际: $DETAIL_COUNT)"
        ERRORS=$((ERRORS + 1))
    fi
fi

# 检查工序流程
if [ "$API_WORKFLOW" = "NULL" ] || [ -z "$API_WORKFLOW" ]; then
    echo -e "${RED}✗ 工序流程丢失${NC}"
    ERRORS=$((ERRORS + 1))
else
    WORKFLOW_COUNT=$(echo "$API_WORKFLOW" | jq '. | length' 2>/dev/null || echo "0")
    if [ "$WORKFLOW_COUNT" = "6" ]; then
        echo -e "${GREEN}✓ 工序流程正确 (6个工序)${NC}"
    else
        echo -e "${RED}✗ 工序流程数量错误${NC} (期望: 6, 实际: $WORKFLOW_COUNT)"
        ERRORS=$((ERRORS + 1))
    fi
fi

# 8. 通过列表API查询（模拟"我的订单"列表页）
echo -e "\n${YELLOW}步骤8: 列表API查询${NC}"
LIST_RESP=$(curl -s -X GET "$BASE_URL/production/order/list?orderNo=$CREATED_ORDER_NO" \
  -H "Authorization: Bearer $TOKEN")

LIST_FOUND=$(echo "$LIST_RESP" | jq -r '.data.records[0].id // "NULL"')
LIST_MERCHANDISER=$(echo "$LIST_RESP" | jq -r '.data.records[0].merchandiser // "NULL"')
LIST_COMPANY=$(echo "$LIST_RESP" | jq -r '.data.records[0].company // "NULL"')

if [ "$LIST_FOUND" = "NULL" ]; then
    echo -e "${RED}✗ 列表API未找到订单${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ 列表API找到订单${NC}"
    check_field "列表-跟单员" "$EXPECTED_MERCHANDISER" "$LIST_MERCHANDISER"
    check_field "列表-公司" "$EXPECTED_COMPANY" "$LIST_COMPANY"
fi

# 9. 清理测试数据
echo -e "\n${YELLOW}步骤9: 清理测试数据${NC}"
DELETE_RESP=$(curl -s -X DELETE "$BASE_URL/production/order/$CREATED_ID" \
  -H "Authorization: Bearer $TOKEN")

DELETE_SUCCESS=$(echo "$DELETE_RESP" | jq -r '.code // "500"')
if [ "$DELETE_SUCCESS" = "200" ]; then
    echo -e "${GREEN}✓ 测试数据已清理${NC}"
else
    echo -e "${YELLOW}⚠ 测试数据清理失败，请手动删除订单 $CREATED_ORDER_NO${NC}"
fi

if [ -n "$CREATED_STYLE_ID" ] && [ "$CREATED_STYLE_ID" != "null" ]; then
    curl -s -X DELETE "$BASE_URL/style/info/$CREATED_STYLE_ID" -H "Authorization: Bearer $TOKEN" >/dev/null 2>&1 || true
fi

if [ -n "$CREATED_FACTORY_ID" ] && [ "$CREATED_FACTORY_ID" != "null" ]; then
    curl -s -X DELETE "$BASE_URL/system/factory/$CREATED_FACTORY_ID" -H "Authorization: Bearer $TOKEN" >/dev/null 2>&1 || true
fi

# 10. 总结
echo -e "\n${YELLOW}===== 测试总结 =====${NC}"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ 所有数据字段传递正确，无数据丢失${NC}"
    exit 0
else
    echo -e "${RED}✗ 发现 $ERRORS 个问题，需要修复${NC}"
    exit 1
fi
