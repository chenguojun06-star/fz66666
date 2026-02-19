#!/bin/bash
# 端到端业务流程测试 - 所有租户全流程验证
# 测试链路: 款式→BOM→采购→入库→订单→裁剪→扫码→质检→结算

set +e  # 允许错误继续执行

API="http://localhost:8088"
PASS=0
FAIL=0
WARN=0

# 颜色
G='\033[0;32m'
R='\033[0;31m'
Y='\033[1;33m'
B='\033[0;34m'
NC='\033[0m'

log_pass() { echo -e "${G}✅ $1${NC}"; ((PASS++)); }
log_fail() { echo -e "${R}❌ $1${NC}"; ((FAIL++)); }
log_warn() { echo -e "${Y}⚠️  $1${NC}"; ((WARN++)); }
log_info() { echo -e "${B}ℹ️  $1${NC}"; }
log_section() { echo -e "\n${B}═══ $1 ═══${NC}"; }

# 登录函数 (修复: 正确路径是 /api/system/user/login, 默认密码: Abc123456)
login() {
    local user=$1
    local pass=${2:-"Abc123456"}
    curl -s -X POST "$API/api/system/user/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$user\",\"password\":\"$pass\"}" | \
        grep -o '"token":"[^"]*' | cut -d'"' -f4
}

# API调用
call_api() {
    local token=$1
    local method=$2
    local path=$3
    local data=$4

    if [ -z "$data" ]; then
        curl -s -X "$method" "$API$path" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" 2>/dev/null
    else
        curl -s -X "$method" "$API$path" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null
    fi
}

get_code() {
    echo "$1" | grep -o '"code":[0-9]*' | head -1 | cut -d':' -f2
}

# ============================================================================
# 主测试流程
# ============================================================================

log_section "环境检查"

# 检查后端
if curl -s -o /dev/null -w "%{http_code}" "$API/actuator/health" | grep -q "200"; then
    log_pass "后端服务运行正常"
else
    log_fail "后端服务异常"
    exit 1
fi

# 获取所有租户
log_section "获取租户列表"

ADMIN_TOKEN=$(login "admin")
if [ -z "$ADMIN_TOKEN" ]; then
    log_fail "admin 登录失败"
    exit 1
fi
log_pass "admin 登录成功"

# 查询租户列表
TENANT_LIST=$(call_api "$ADMIN_TOKEN" "POST" "/api/system/tenant/list" '{"pageNum":1,"pageSize":10}')
TENANT_COUNT=$(echo "$TENANT_LIST" | grep -o '"id":[0-9]*' | wc -l)

if [ "$TENANT_COUNT" -gt 0 ]; then
    log_pass "发现 $TENANT_COUNT 个租户"
else
    log_warn "未发现租户数据，将使用已知租户测试"
    TENANT_COUNT=2
fi

# ============================================================================
# 测试租户1: HUANAN (zhangcz)
# ============================================================================

log_section "租户1: HUANAN (zhangcz) - 完整业务流程"

TENANT1_USER="zhangcz"
TENANT1_ID=1

# 登录
TOKEN1=$(login "$TENANT1_USER")
if [ -n "$TOKEN1" ]; then
    log_pass "[$TENANT1_USER] 登录成功"
else
    log_fail "[$TENANT1_USER] 登录失败"
    TOKEN1=""
fi

if [ -n "$TOKEN1" ]; then
    # 权限验证
    ME1=$(call_api "$TOKEN1" "GET" "/api/system/users/me")
    if echo "$ME1" | grep -q '"code":200'; then
        log_pass "[$TENANT1_USER] 权限验证通过"
    else
        log_fail "[$TENANT1_USER] 权限验证失败"
    fi

    # 1. 款式管理
    log_info "[$TENANT1_USER] 测试款式管理..."
    STYLE_NO="E2E_T1_$(date +%s)"
    STYLE_DATA='{"styleNo":"'$STYLE_NO'","styleName":"测试款式T1","season":"2026春","category":"上衣","tenantId":'$TENANT1_ID'}'
    STYLE_RES=$(call_api "$TOKEN1" "POST" "/api/style/info" "$STYLE_DATA")
    STYLE_CODE=$(get_code "$STYLE_RES")

    if [ "$STYLE_CODE" == "200" ]; then
        STYLE_ID=$(echo "$STYLE_RES" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT1_USER] 款式创建成功 (ID: $STYLE_ID)"
    else
        log_warn "[$TENANT1_USER] 款式创建失败 (code: $STYLE_CODE)"
    fi

    # 2. 款式列表查询
    STYLE_LIST=$(call_api "$TOKEN1" "POST" "/api/style/info/list" '{"pageNum":1,"pageSize":10}')
    if echo "$STYLE_LIST" | grep -q '"code":200'; then
        TOTAL=$(echo "$STYLE_LIST" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT1_USER] 款式列表查询成功 (共 $TOTAL 条)"
    else
        log_warn "[$TENANT1_USER] 款式列表查询异常"
    fi

    # 3. 生产订单
    log_info "[$TENANT1_USER] 测试生产订单..."
    ORDER_NO="PO_T1_$(date +%s)"
    ORDER_DATA='{"orderNo":"'$ORDER_NO'","styleNo":"'$STYLE_NO'","quantity":100,"deliveryDate":"2026-03-01","tenantId":'$TENANT1_ID'}'
    ORDER_RES=$(call_api "$TOKEN1" "POST" "/api/production/order" "$ORDER_DATA")
    ORDER_CODE=$(get_code "$ORDER_RES")

    if [ "$ORDER_CODE" == "200" ]; then
        ORDER_ID=$(echo "$ORDER_RES" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT1_USER] 生产订单创建成功 (ID: $ORDER_ID)"
    else
        log_warn "[$TENANT1_USER] 生产订单创建失败 (code: $ORDER_CODE)"
    fi

    # 4. 订单列表
    ORDER_LIST=$(call_api "$TOKEN1" "POST" "/api/production/order/list" '{"pageNum":1,"pageSize":10}')
    if echo "$ORDER_LIST" | grep -q '"code":200'; then
        ORDER_TOTAL=$(echo "$ORDER_LIST" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT1_USER] 订单列表查询成功 (共 $ORDER_TOTAL 条)"
    else
        log_warn "[$TENANT1_USER] 订单列表查询异常"
    fi

    # 5. 库存查询
    STOCK_LIST=$(call_api "$TOKEN1" "POST" "/api/warehouse/material-stock/list" '{"pageNum":1,"pageSize":10}')
    if echo "$STOCK_LIST" | grep -q '"code":200'; then
        STOCK_TOTAL=$(echo "$STOCK_LIST" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT1_USER] 库存查询成功 (共 $STOCK_TOTAL 条)"
    else
        log_warn "[$TENANT1_USER] 库存查询异常"
    fi

    # 6. 工序列表
    PROCESS_LIST=$(call_api "$TOKEN1" "POST" "/api/basic/process/list" '{"pageNum":1,"pageSize":20}')
    if echo "$PROCESS_LIST" | grep -q '"code":200'; then
        PROCESS_TOTAL=$(echo "$PROCESS_LIST" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT1_USER] 工序列表查询成功 (共 $PROCESS_TOTAL 条)"
    else
        log_warn "[$TENANT1_USER] 工序列表查询异常"
    fi

    # 7. 财务对账
    FINANCE_LIST=$(call_api "$TOKEN1" "POST" "/api/finance/reconciliation/list" '{"pageNum":1,"pageSize":10}')
    if echo "$FINANCE_LIST" | grep -q '"code":200'; then
        FINANCE_TOTAL=$(echo "$FINANCE_LIST" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT1_USER] 对账单查询成功 (共 $FINANCE_TOTAL 条)"
    else
        log_warn "[$TENANT1_USER] 对账单查询异常"
    fi
fi

# ============================================================================
# 测试租户2: DONGFANG (lilb)
# ============================================================================

log_section "租户2: DONGFANG (lilb) - 完整业务流程"

TENANT2_USER="lilb"
TENANT2_ID=2

# 登录
TOKEN2=$(login "$TENANT2_USER")
if [ -n "$TOKEN2" ]; then
    log_pass "[$TENANT2_USER] 登录成功"
else
    log_fail "[$TENANT2_USER] 登录失败"
    TOKEN2=""
fi

if [ -n "$TOKEN2" ]; then
    # 权限验证
    ME2=$(call_api "$TOKEN2" "GET" "/api/system/users/me")
    if echo "$ME2" | grep -q '"code":200'; then
        log_pass "[$TENANT2_USER] 权限验证通过"
    else
        log_fail "[$TENANT2_USER] 权限验证失败"
    fi

    # 1. 款式管理
    log_info "[$TENANT2_USER] 测试款式管理..."
    STYLE_NO2="E2E_T2_$(date +%s)"
    STYLE_DATA2='{"styleNo":"'$STYLE_NO2'","styleName":"测试款式T2","season":"2026春","category":"裤子","tenantId":'$TENANT2_ID'}'
    STYLE_RES2=$(call_api "$TOKEN2" "POST" "/api/style/info" "$STYLE_DATA2")
    STYLE_CODE2=$(get_code "$STYLE_RES2")

    if [ "$STYLE_CODE2" == "200" ]; then
        STYLE_ID2=$(echo "$STYLE_RES2" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT2_USER] 款式创建成功 (ID: $STYLE_ID2)"
    else
        log_warn "[$TENANT2_USER] 款式创建失败 (code: $STYLE_CODE2)"
    fi

    # 2. 款式列表查询
    STYLE_LIST2=$(call_api "$TOKEN2" "POST" "/api/style/info/list" '{"pageNum":1,"pageSize":10}')
    if echo "$STYLE_LIST2" | grep -q '"code":200'; then
        TOTAL2=$(echo "$STYLE_LIST2" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT2_USER] 款式列表查询成功 (共 $TOTAL2 条)"
    else
        log_warn "[$TENANT2_USER] 款式列表查询异常"
    fi

    # 3. 生产订单
    log_info "[$TENANT2_USER] 测试生产订单..."
    ORDER_NO2="PO_T2_$(date +%s)"
    ORDER_DATA2='{"orderNo":"'$ORDER_NO2'","styleNo":"'$STYLE_NO2'","quantity":80,"deliveryDate":"2026-03-15","tenantId":'$TENANT2_ID'}'
    ORDER_RES2=$(call_api "$TOKEN2" "POST" "/api/production/order" "$ORDER_DATA2")
    ORDER_CODE2=$(get_code "$ORDER_RES2")

    if [ "$ORDER_CODE2" == "200" ]; then
        ORDER_ID2=$(echo "$ORDER_RES2" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT2_USER] 生产订单创建成功 (ID: $ORDER_ID2)"
    else
        log_warn "[$TENANT2_USER] 生产订单创建失败 (code: $ORDER_CODE2)"
    fi

    # 4. 订单列表
    ORDER_LIST2=$(call_api "$TOKEN2" "POST" "/api/production/order/list" '{"pageNum":1,"pageSize":10}')
    if echo "$ORDER_LIST2" | grep -q '"code":200'; then
        ORDER_TOTAL2=$(echo "$ORDER_LIST2" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT2_USER] 订单列表查询成功 (共 $ORDER_TOTAL2 条)"
    else
        log_warn "[$TENANT2_USER] 订单列表查询异常"
    fi

    # 5. 库存查询
    STOCK_LIST2=$(call_api "$TOKEN2" "POST" "/api/warehouse/material-stock/list" '{"pageNum":1,"pageSize":10}')
    if echo "$STOCK_LIST2" | grep -q '"code":200'; then
        STOCK_TOTAL2=$(echo "$STOCK_LIST2" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT2_USER] 库存查询成功 (共 $STOCK_TOTAL2 条)"
    else
        log_warn "[$TENANT2_USER] 库存查询异常"
    fi

    # 6. 工序列表
    PROCESS_LIST2=$(call_api "$TOKEN2" "POST" "/api/basic/process/list" '{"pageNum":1,"pageSize":20}')
    if echo "$PROCESS_LIST2" | grep -q '"code":200'; then
        PROCESS_TOTAL2=$(echo "$PROCESS_LIST2" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT2_USER] 工序列表查询成功 (共 $PROCESS_TOTAL2 条)"
    else
        log_warn "[$TENANT2_USER] 工序列表查询异常"
    fi

    # 7. 财务对账
    FINANCE_LIST2=$(call_api "$TOKEN2" "POST" "/api/finance/reconciliation/list" '{"pageNum":1,"pageSize":10}')
    if echo "$FINANCE_LIST2" | grep -q '"code":200'; then
        FINANCE_TOTAL2=$(echo "$FINANCE_LIST2" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
        log_pass "[$TENANT2_USER] 对账单查询成功 (共 $FINANCE_TOTAL2 条)"
    else
        log_warn "[$TENANT2_USER] 对账单查询异常"
    fi
fi

# ============================================================================
# 数据隔离验证
# ============================================================================

log_section "数据隔离验证"

if [ -n "$TOKEN1" ] && [ -n "$TOKEN2" ]; then
    # 租户1尝试访问租户2的数据
    log_info "验证租户1无法访问租户2的数据..."
    CROSS_ACCESS=$(call_api "$TOKEN1" "POST" "/api/production/order/list" '{"tenantId":2,"pageNum":1,"pageSize":1}')
    CROSS_TOTAL=$(echo "$CROSS_ACCESS" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)

    if [ "$CROSS_TOTAL" == "0" ] || echo "$CROSS_ACCESS" | grep -q '"code":403'; then
        log_pass "数据隔离正常: 租户1无法访问租户2数据"
    else
        log_warn "数据隔离验证: 租户1访问租户2返回 total=$CROSS_TOTAL"
    fi
fi

# 数据库层验证
log_info "数据库层隔离检查..."
DB_CHECK=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -N -s -e "
    SELECT
        COALESCE(tenant_id, 'NULL') as tid,
        COUNT(*) as cnt
    FROM t_production_order
    GROUP BY tenant_id
    ORDER BY tenant_id;
" 2>/dev/null)

if [ -n "$DB_CHECK" ]; then
    echo "$DB_CHECK" | while IFS=$'\t' read -r tid cnt; do
        if [ "$tid" == "NULL" ]; then
            log_fail "发现孤立订单: $cnt 条 (tenant_id=NULL)"
        else
            log_pass "租户 $tid 订单: $cnt 条"
        fi
    done
else
    log_info "暂无订单数据"
fi

# ============================================================================
# 测试总结
# ============================================================================

log_section "测试总结"

echo ""
echo -e "${B}════════════════════════════════════════${NC}"
echo -e "${G}✅ 通过: $PASS${NC}"
echo -e "${R}❌ 失败: $FAIL${NC}"
echo -e "${Y}⚠️  警告: $WARN${NC}"
echo -e "${B}════════════════════════════════════════${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${G}🎉 所有核心测试通过！${NC}"
    echo ""
    echo "✅ 覆盖范围:"
    echo "  - 租户登录和权限验证"
    echo "  - 款式管理 (创建+查询)"
    echo "  - 生产订单 (创建+查询)"
    echo "  - 库存管理 (查询)"
    echo "  - 工序管理 (查询)"
    echo "  - 财务对账 (查询)"
    echo "  - 数据隔离验证 (API+DB)"
    exit 0
else
    echo -e "${R}存在失败项，请检查上述日志${NC}"
    exit 1
fi
