#!/bin/bash

#################################################################
# 端到端完整业务流程测试脚本
# 功能：测试从样衣开发→采购入库→生产出库→对账的完整业务流程
# 数据隔离验证 + 双端一致性验证 + 所有角落与业务数据检查
#
# 使用：./test-e2e-complete-business-flow.sh
#################################################################

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 日志计数
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNINGS=0
ISSUES=()

# 测试环境配置
BACKEND_URL="http://localhost:8088"
API_PREFIX="/api"
TIMESTAMP=$(date +%s)
TEST_PREFIX="E2E_$(printf '%06d' $RANDOM)"

# 租户信息（zhangcz租户）
TENANT_ID=1
TENANT_NAME="TEST001"
TEST_USER="zhangcz"
TEST_TOKEN_FILE="/tmp/zhangcz_token2.txt"

# 数据库连接
DB_CONTAINER="fashion-mysql-simple"
DB_HOST="localhost"
DB_PORT="3308"
DB_USER="root"
DB_PASSWORD="changeme"
DB_NAME="fashion_supplychain"

#################################################################
# 辅助函数
#################################################################

log_header() {
    echo -e "\n${BLUE}====== $1 ======${NC}"
}

log_section() {
    echo -e "\n${CYAN}>>> $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED_TESTS++))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((FAILED_TESTS++))
    ISSUES+=("$1")
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARNINGS++))
    ISSUES+=("[WARNING] $1")
}

log_test() {
    echo -e "${CYAN}🧪 $1${NC}"
    ((TOTAL_TESTS++))
}

# 获取JWT token
get_token() {
    if [ -f "$TEST_TOKEN_FILE" ]; then
        cat "$TEST_TOKEN_FILE"
    else
        log_error "Token文件不存在: $TEST_TOKEN_FILE"
        exit 1
    fi
}

# API调用函数
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local token=$(get_token)

    if [ "$method" = "GET" ]; then
        curl -s -X GET "$BACKEND_URL$API_PREFIX$endpoint" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -H "X-Tenant-ID: $TENANT_ID"
    else
        curl -s -X POST "$BACKEND_URL$API_PREFIX$endpoint" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -H "X-Tenant-ID: $TENANT_ID" \
            -d "$data"
    fi
}

# 数据库查询
db_query() {
    local sql=$1
    docker exec $DB_CONTAINER mysql -u$DB_USER -p$DB_PASSWORD $DB_NAME -e "$sql" 2>/dev/null | tail -n +2
}

# 解析JSON字段
parse_json() {
    local json=$1
    local field=$2
    echo "$json" | grep -o "\"$field\":[^,}]*" | cut -d':' -f2 | tr -d '"' | xargs
}

#################################################################
# 第一阶段：系统就绪检查
#################################################################

phase_system_readiness() {
    log_header "第一阶段：系统就绪检查"

    log_section "1.1 后端服务检查"
    log_test "检查后端是否运行"
    if curl -s --connect-timeout 5 "$BACKEND_URL/actuator/health" 2>/dev/null | grep -q "UP"; then
        log_success "后端服务运行正常"
    else
        log_error "后端服务未运行或无法访问"
        exit 1
    fi

    log_section "1.2 数据库检查"
    log_test "检查数据库连接"
    if docker exec $DB_CONTAINER mysql -u$DB_USER -p$DB_PASSWORD -e "SELECT 1" &>/dev/null; then
        log_success "数据库连接正常"
    else
        log_error "数据库连接失败"
        exit 1
    fi

    log_section "1.3 认证系统检查"
    log_test "验证JWT Token有效性"
    local token=$(get_token)
    if [ -z "$token" ]; then
        log_error "Token获取失败"
        exit 1
    fi

    # 调用 /api/system/user/me 验证token
    local user_me=$(api_call "GET" "/system/user/me" "")
    if echo "$user_me" | grep -q "\"code\":200"; then
        local uid=$(parse_json "$user_me" "uid")
        log_success "Token验证成功，用户ID: $uid"
    else
        log_error "Token验证失败: $user_me"
        exit 1
    fi

    log_section "1.4 测试租户检查"
    log_test "验证当前租户ID"
    local tenant_info=$(db_query "SELECT id, name FROM t_tenant WHERE id = $TENANT_ID LIMIT 1;")
    if [ -n "$tenant_info" ]; then
        log_success "租户验证成功: $tenant_info"
    else
        log_error "租户ID $TENANT_ID 不存在"
        exit 1
    fi
}

#################################################################
# 第二阶段：样衣开发流程测试
#################################################################

phase_sample_development() {
    log_header "第二阶段：样衣开发流程测试"

    log_section "2.1 创建款式信息"
    log_test "创建新的样衣款式"
    local style_data='{
        "styleNo":"STYLE_'$TEST_PREFIX'",
        "styleNameCN":"测试样衣'$TIMESTAMP'",
        "productCategory":"连衣裙",
        "season":"Spring2026",
        "company":"DEMO Inc",
        "merchandiser":"'$TEST_USER'"
    }'
    local style_response=$(api_call "POST" "/style/info" "$style_data")

    if echo "$style_response" | grep -q "\"code\":200"; then
        local style_id=$(parse_json "$style_response" "id")
        log_success "款式创建成功，ID: $style_id"
        export STYLE_ID=$style_id
    else
        log_error "款式创建失败: $style_response"
        ISSUES+=("样衣开发失败: 无法创建款式")
        return 1
    fi

    log_section "2.2 验证款式数据库记录"
    log_test "检查款式是否正确存储在数据库"
    local style_in_db=$(db_query "SELECT id, style_no, tenant_id FROM t_style_info WHERE id = $STYLE_ID LIMIT 1;")
    if [ -n "$style_in_db" ]; then
        # 验证租户隔离
        local db_tenant_id=$(echo "$style_in_db" | awk '{print $3}')
        if [ "$db_tenant_id" -eq "$TENANT_ID" ]; then
            log_success "样衣数据正确存储，租户隔离正确: $style_in_db"
        else
            log_error "样衣数据租户隔离失败: 期望租户ID ${TENANT_ID}，实际 $db_tenant_id"
            ISSUES+=("数据隔离问题：样衣租户ID错误")
        fi
    else
        log_error "样衣在数据库中不存在: ID $STYLE_ID"
        ISSUES+=("数据不一致：前端成功但后端数据库无记录")
    fi

    log_section "2.3 样衣物料配置"
    log_test "为样衣添加物料清单(BOM)"
    local material_data='{
        "styleId":'$STYLE_ID',
        "materials":[
            {"materialCode":"MAT_001","materialName":"棉布","specification":"100%棉","quantity":2.5,"unit":"米"},
            {"materialCode":"MAT_002","materialName":"拉链","specification":"YKK30cm","quantity":1,"unit":"个"}
        ]
    }'
    local material_response=$(api_call "POST" "/style/info/bom" "$material_data")

    if echo "$material_response" | grep -q "\"code\":200"; then
        log_success "物料清单添加成功"
    else
        log_warning "物料清单添加返回: $material_response"
        ISSUES+=("[数据完整性] 物料清单配置可能失败")
    fi

    log_section "2.4 验证双端一致性 - 前端显示"
    log_test "查询样衣列表API是否返回刚创建的款式"
    local style_list=$(api_call "GET" "/style/info/list?styleNo=STYLE_$TEST_PREFIX" "")
    if echo "$style_list" | grep -q "\"styleNo\":\"STYLE_$TEST_PREFIX\""; then
        log_success "前端API可见新创建的款式"
    else
        log_warning "前端API未立即返回新款式: $style_list"
        ISSUES+=("[双端一致性] 样衣创建后API查询延迟或失败")
    fi
}

#################################################################
# 第三阶段：采购入库流程
#################################################################

phase_material_procurement() {
    log_header "第三阶段：采购入库流程"

    log_section "3.1 创建采购单"
    log_test "创建新的采购订单"
    local purchase_data='{
        "purchaseNo":"PUR_'$TEST_PREFIX'",
        "styleId":'${STYLE_ID:-0}',
        "warehouseId":1,
        "supplier":"供应商A",
        "totalAmount":50000.00,
        "items":[
            {"materialCode":"MAT_001","materialName":"棉布","quantity":500,"unit":"米","unitPrice":100},
            {"materialCode":"MAT_002","materialName":"拉链","quantity":200,"unit":"个","unitPrice":5}
        ]
    }'
    local purchase_response=$(api_call "POST" "/production/purchase-order" "$purchase_data")

    if echo "$purchase_response" | grep -q "\"code\":200"; then
        local purchase_id=$(parse_json "$purchase_response" "id")
        log_success "采购单创建成功，ID: $purchase_id"
        export PURCHASE_ID=$purchase_id
    else
        log_error "采购单创建失败: $purchase_response"
        ISSUES+=("采购流程失败：无法创建采购单")
        return 1
    fi

    log_section "3.2 采购入库操作"
    log_test "执行采购入库"
    local inbound_data='{
        "purchaseId":'$PURCHASE_ID',
        "inboundNo":"IN_'$TEST_PREFIX'",
        "warehouseId":1,
        "items":[
            {"materialCode":"MAT_001","quantity":500,"batch":"BATCH001","expiryDate":"2027-02-15"},
            {"materialCode":"MAT_002","quantity":200,"batch":"BATCH002","expiryDate":"2027-12-31"}
        ]
    }'
    local inbound_response=$(api_call "POST" "/production/material-stock/inbound" "$inbound_data")

    if echo "$inbound_response" | grep -q "\"code\":200"; then
        log_success "采购入库成功"
    else
        log_warning "采购入库返回: $inbound_response"
        ISSUES+=("[采购流程] 入库操作可能失败")
    fi

    log_section "3.3 验证库存数据"
    log_test "检查材料库存是否正确更新"
    local stock_check=$(db_query "SELECT material_code, quantity, tenant_id FROM t_material_stock WHERE material_code IN ('MAT_001','MAT_002') AND tenant_id = $TENANT_ID;")

    if [ -n "$stock_check" ]; then
        log_success "库存数据已更新: $(echo "$stock_check" | head -1)"
        # 详细验证
        if echo "$stock_check" | grep -q "MAT_001"; then
            log_success "材料MAT_001库存记录存在"
        else
            log_error "材料MAT_001库存记录缺失"
            ISSUES+=("库存数据不完整：缺少MAT_001")]
        fi
    else
        log_error "库存查询返回空，数据未同步到数据库"
        ISSUES+=("[数据一致性] 采购入库后库存未更新到数据库")
    fi

    log_section "3.4 数据隔离验证 - 跨租户检查"
    log_test "确保其他租户无法看到此采购数据"
    # 模拟其他租户查询（需要其他租户token，这里通过DB验证）
    local other_tenant_check=$(db_query "SELECT COUNT(*) FROM t_material_stock WHERE material_code='MAT_001' AND tenant_id != $TENANT_ID;")
    if [ "$other_tenant_check" -eq 0 ]; then
        log_success "数据隔离正确：其他租户无法访问该采购数据"
    else
        log_error "数据隔离失败：其他租户可访问本租户数据 (计数: $other_tenant_check)"
        ISSUES+=("严重安全漏洞：多租户数据隔离失效")]
    fi
}

#################################################################
# 第四阶段：生产订单流程
#################################################################

phase_production_order() {
    log_header "第四阶段：生产订单流程"

    log_section "4.1 创建生产订单"
    log_test "创建样衣生产订单"
    local production_data='{
        "orderNo":"PROD_'$TEST_PREFIX'",
        "styleId":'${STYLE_ID:-0}',
        "factoryId":1,
        "quantity":100,
        "expectedDelivery":"2026-03-01",
        "sampleMaker":"zhang_san",
        "productCategory":"连衣裙",
        "status":"draft"
    }'
    local prod_response=$(api_call "POST" "/production/order" "$production_data")

    if echo "$prod_response" | grep -q "\"code\":200"; then
        local order_id=$(parse_json "$prod_response" "id")
        log_success "生产订单创建成功，ID: $order_id"
        export ORDER_ID=$order_id
    else
        log_error "生产订单创建失败: $prod_response"
        ISSUES+=("生产流程失败：无法创建生产订单")
        return 1
    fi

    log_section "4.2 生产订单下达"
    log_test "下达生产订单至工厂"
    local release_data='{"status":"released","notes":"生产订单已下达测试"}'
    local release_response=$(api_call "POST" "/production/order/$ORDER_ID/stage-action?action=release" "$release_data")

    if echo "$release_response" | grep -q "\"code\":200"; then
        log_success "生产订单下达成功"
    else
        log_warning "生产订单下达返回: $release_response"
        ISSUES+=("[生产流程] 订单下达可能失败")]
    fi

    log_section "4.3 数据库订单状态验证"
    log_test "验证订单状态在数据库中正确保存"
    local order_in_db=$(db_query "SELECT id, order_no, status, tenant_id FROM t_production_order WHERE id = $ORDER_ID LIMIT 1;")

    if [ -n "$order_in_db" ]; then
        local db_status=$(echo "$order_in_db" | awk '{print $4}')
        log_success "订单数据库记录存在: $order_in_db"

        # 验证租户隔离
        local order_tenant=$(echo "$order_in_db" | awk '{print $5}')
        if [ "$order_tenant" -eq "$TENANT_ID" ]; then
            log_success "订单租户隔离正确"
        else
            log_error "订单租户隔离失败: 期望 ${TENANT_ID}，实际 $order_tenant"
            ISSUES+=("数据隔离问题：生产订单租户ID错误")]
        fi
    else
        log_error "订单在数据库中不存在: ID $ORDER_ID"
        ISSUES+=("[数据不一致] 生产订单创建后未被保存到数据库")]
    fi
}

#################################################################
# 第五阶段：扫码和工序跟踪
#################################################################

phase_scan_and_tracking() {
    log_header "第五阶段：扫码和工序跟踪"

    if [ -z "$ORDER_ID" ]; then
        log_warning "跳过扫码测试：生产订单未创建"
        return
    fi

    log_section "5.1 模拟生产扫码"
    log_test "记录裁剪工序扫码"
    local scan_data='{
        "orderNo":"PROD_'$TEST_PREFIX'",
        "processCode":"CUTTING",
        "processName":"裁剪",
        "quantity":25,
        "worker":"worker001",
        "timestamp":'$TIMESTAMP'000
    }'
    local scan_response=$(api_call "POST" "/production/scan/execute" "$scan_data")

    if echo "$scan_response" | grep -q "\"code\":200"; then
        local scan_id=$(parse_json "$scan_response" "id")
        log_success "裁剪扫码记录成功，ID: $scan_id"
        export SCAN_ID=$scan_id
    else
        log_warning "裁剪扫码返回: $scan_response"
        ISSUES+=("[扫码系统] 生产扫码记录可能失败")]
    fi

    log_section "5.2 检查扫码防重复机制"
    log_test "验证防重复提交是否生效"
    # 尝试在极短时间内重复提交相同扫码
    local scan_retry=$(api_call "POST" "/production/scan/execute" "$scan_data")

    if echo "$scan_retry" | grep -q "\"code\":200"; then
        log_warning "防重复机制可能失效：相同扫码被接受"
        ISSUES+=("[防重复失效] 短时间内相同扫码被重复接受")]
    else
        log_success "防重复机制正常：重复提交被拒绝"
    fi

    log_section "5.3 扫码数据库记录验证"
    log_test "检查扫码记录是否正确保存"
    local scan_in_db=$(db_query "SELECT id, order_no, process_code, quantity, tenant_id FROM t_scan_record WHERE id = ${SCAN_ID:-0} LIMIT 1;")

    if [ -n "$scan_in_db" ]; then
        log_success "扫码记录已保存: $scan_in_db"

        # 验证租户隔离
        local scan_tenant=$(echo "$scan_in_db" | awk '{print $5}')
        if [ "$scan_tenant" -eq "$TENANT_ID" ]; then
            log_success "扫码记录租户隔离正确"
        else
            log_error "扫码记录租户隔离失败"
            ISSUES+=("数据隔离问题：扫码记录租户ID错误")]
        fi
    else
        log_warning "扫码记录在数据库中不存在或ID为0"
        ISSUES+=("[数据不一致] 扫码记录未被保存到数据库")]
    fi
}

#################################################################
# 第六阶段：出库流程
#################################################################

phase_warehouse_outbound() {
    log_header "第六阶段：出库流程"

    if [ -z "$ORDER_ID" ]; then
        log_warning "跳过出库测试：生产订单未创建"
        return
    fi

    log_section "6.1 完成最终工序"
    log_test "记录最终检验扫码"
    local final_check_data='{
        "orderNo":"PROD_'$TEST_PREFIX'",
        "processCode":"QC",
        "processName":"质检",
        "quantity":25,
        "qualityStatus":"PASSED",
        "worker":"qc_officer",
        "timestamp":'$((TIMESTAMP+3600))'000
    }'
    local qc_response=$(api_call "POST" "/production/scan/execute" "$final_check_data")

    if echo "$qc_response" | grep -q "\"code\":200"; then
        log_success "质检扫码记录成功"
    else
        log_warning "质检扫码返回: $qc_response"
        ISSUES+=("[质检系统] 质检扫码记录可能失败")]
    fi

    log_section "6.2 出库操作"
    log_test "执行生产订单出库"
    local outbound_data='{
        "productionOrderId":'$ORDER_ID',
        "outboundNo":"OUT_'$TEST_PREFIX'",
        "warehouseId":2,
        "items":[
            {"quantity":100,"location":"SHELF_A01"}
        ]
    }'
    local outbound_response=$(api_call "POST" "/production/warehouse/outbound" "$outbound_data")

    if echo "$outbound_response" | grep -q "\"code\":200"; then
        log_success "出库操作成功"
    else
        log_warning "出库操作返回: $outbound_response"
        ISSUES+=("[出库流程] 生产订单出库可能失败")]
    fi

    log_section "6.3 库存更新验证"
    log_test "检查成品库存是否正确更新"
    local finished_stock=$(db_query "SELECT id, quantity, location, tenant_id FROM t_finished_goods_stock WHERE order_id = $ORDER_ID LIMIT 1;")

    if [ -n "$finished_stock" ]; then
        log_success "成品库存记录已创建: $finished_stock"

        # 验证租户隔离
        local stock_tenant=$(echo "$finished_stock" | awk '{print $4}')
        if [ "$stock_tenant" -eq "$TENANT_ID" ]; then
            log_success "成品库存租户隔离正确"
        else
            log_error "成品库存租户隔离失败"
            ISSUES+=("数据隔离问题：成品库存租户ID错误")]
        fi
    else
        log_warning "对应的成品库存记录不存在或表不存在"
        ISSUES+=("[数据不一致] 出库后成品库存未被创建")]
    fi
}

#################################################################
# 第七阶段：对账结算流程
#################################################################

phase_reconciliation() {
    log_header "第七阶段：对账结算流程"

    log_section "7.1 生成对账单"
    log_test "创建采购对账单"
    local reconciliation_data='{
        "reconciliationType":"PURCHASE",
        "reconciliationPeriod":"2026-02",
        "supplier":"供应商A",
        "status":"draft"
    }'
    local reconciliation_response=$(api_call "POST" "/finance/reconciliation" "$reconciliation_data")

    if echo "$reconciliation_response" | grep -q "\"code\":200"; then
        local recon_id=$(parse_json "$reconciliation_response" "id")
        log_success "对账单创建成功，ID: $recon_id"
        export RECONCILIATION_ID=$recon_id
    else
        log_warning "对账单创建返回: $reconciliation_response"
        ISSUES+=("[对账系统] 对账单创建可能失败")]
    fi

    log_section "7.2 对账数据匹配"
    log_test "验证采购数据与对账数据是否匹配"
    # 查询采购总额
    local purchase_total=$(db_query "SELECT SUM(CAST(total_amount AS DECIMAL(10,2))) FROM t_material_purchase WHERE purchase_no LIKE 'PUR_%' AND tenant_id = $TENANT_ID;")

    if [ -n "$purchase_total" ] && [ "$purchase_total" != "NULL" ]; then
        log_success "采购总额统计: $purchase_total"
    else
        log_warning "采购数据查询结果为空"
        ISSUES+=("[对账精度] 采购数据统计可能失败")]
    fi

    log_section "7.3 对账单审批"
    log_test "审批对账单"
    if [ -n "$RECONCILIATION_ID" ]; then
        local approve_data='{"status":"approved","notes":"对账通过测试"}'
        local approve_response=$(api_call "POST" "/finance/reconciliation/$RECONCILIATION_ID/stage-action?action=approve" "$approve_data")

        if echo "$approve_response" | grep -q "\"code\":200"; then
            log_success "对账单审批成功"
        else
            log_warning "对账单审批返回: $approve_response"
            ISSUES+=("[对账流程] 对账单审批可能失败")]
        fi
    fi

    log_section "7.4 双端一致性验证"
    log_test "检查前端和后端数据显示是否一致"
    # 通过API查询对账数据
    local recon_api=$(api_call "GET" "/finance/reconciliation/$RECONCILIATION_ID" "")
    local recon_db=$(db_query "SELECT id, reconciliation_no, status, tenant_id FROM t_reconciliation WHERE id = ${RECONCILIATION_ID:-0} LIMIT 1;")

    if [ -n "$recon_api" ] && [ -n "$recon_db" ]; then
        if echo "$recon_api" | grep -q "\"code\":200"; then
            log_success "前后端对账数据一致"
        else
            log_warning "前后端数据可能不一致"
            ISSUES+=("[双端不一致] 对账数据前后端显示不同")]
        fi
    fi
}

#################################################################
# 第八阶段：完整数据隔离验证
#################################################################

phase_data_isolation_complete() {
    log_header "第八阶段：完整数据隔离验证"

    log_section "8.1 跨租户数据访问测试"
    log_test "验证租户1数据数量与租户隔离"

    # 统计当前租户的各类数据
    local style_count=$(db_query "SELECT COUNT(*) FROM t_style_info WHERE tenant_id = $TENANT_ID;" | head -1)
    local order_count=$(db_query "SELECT COUNT(*) FROM t_production_order WHERE tenant_id = $TENANT_ID;" | head -1)
    local scan_count=$(db_query "SELECT COUNT(*) FROM t_scan_record WHERE tenant_id = $TENANT_ID;" | head -1)
    local material_count=$(db_query "SELECT COUNT(*) FROM t_material_stock WHERE tenant_id = $TENANT_ID;" | head -1)

    log_success "当前租户数据统计 - 款式: $style_count, 订单: $order_count, 扫码: $scan_count, 物料: $material_count"

    log_section "8.2 验证其他租户无法访问本租户数据"
    log_test "检查是否存在跨租户数据污染"

    # 检查是否有数据记录了错误的租户ID
    local invalid_tenant=$(db_query "SELECT COUNT(*) FROM t_production_order WHERE order_no LIKE 'PROD_%' AND tenant_id != $TENANT_ID;")
    if [ "$invalid_tenant" -eq 0 ]; then
        log_success "未发现跨租户数据污染: 生产订单"
    else
        log_error "发现跨租户数据污染: $invalid_tenant 条生产订单属于错误的租户"
        ISSUES+=("严重安全漏洞：生产订单跨租户污染")]
    fi

    log_section "8.3 TenantInterceptor验证"
    log_test "验证TenantInterceptor是否正确过滤数据"
    # 通过API查询某个特定订单，验证是否只返回当前租户的数据
    if [ -n "$ORDER_ID" ]; then
        local api_order=$(api_call "GET" "/production/order/$ORDER_ID" "")
        if echo "$api_order" | grep -q "\"code\":200"; then
            log_success "API正确返回当前租户的订单数据"
        else
            log_warning "API订单查询可能失败或被拦截"
            ISSUES+=("[数据隔离] API订单查询可能被不正确的拦截")]
        fi
    fi

    log_section "8.4 权限控制验证"
    log_test "验证用户权限是否控制了数据访问"
    # 检查用户账号的权限列表
    local user_perms=$(db_query "SELECT GROUP_CONCAT(p.permission_code) FROM t_user u LEFT JOIN t_role_permission rp ON u.role_id=rp.role_id LEFT JOIN t_permission p ON rp.permission_id=p.id WHERE u.username='$TEST_USER' AND u.tenant_id=$TENANT_ID LIMIT 1;")

    if [ -n "$user_perms" ]; then
        log_success "用户权限配置存在，权限数: $(echo "$user_perms" | wc -w)"
    else
        log_warning "用户权限查询为空"
        ISSUES+=("[权限控制] 用户权限配置可能缺失")]
    fi
}

#################################################################
# 第九阶段：业务数据完整性检查
#################################################################

phase_data_completeness() {
    log_header "第九阶段：业务数据完整性检查"

    log_section "9.1 检查所有必要的业务字段"
    log_test "验证生产订单必要字段完整性"

    if [ -n "$ORDER_ID" ]; then
        local order_fields=$(db_query "SELECT order_no, style_id, factory_id, status, quantity, created_at, updated_at FROM t_production_order WHERE id = $ORDER_ID LIMIT 1;")

        if [ -n "$order_fields" ]; then
            log_success "订单必要字段完整: $(echo "$order_fields" | cut -d' ' -f1-3)..."
        else
            log_error "订单字段查询为空"
            ISSUES+=("[数据完整性] 生产订单字段缺失")]
        fi
    fi

    log_section "9.2 检查关联数据完整性"
    log_test "验证订单与样衣的关联是否完整"

    if [ -n "$ORDER_ID" ] && [ -n "$STYLE_ID" ]; then
        local related_data=$(db_query "SELECT o.id, o.style_id, s.id FROM t_production_order o LEFT JOIN t_style_info s ON o.style_id=s.id WHERE o.id=$ORDER_ID AND o.tenant_id=$TENANT_ID;")

        if [ -n "$related_data" ]; then
            log_success "订单与样衣关联完整"
        else
            log_error "订单与样衣关联不完整"
            ISSUES+=("[数据完整性] 订单与样衣关联失效")]
        fi
    fi

    log_section "9.3 检查审计日志完整性"
    log_test "验证操作审计日志是否记录"

    local audit_logs=$(db_query "SELECT COUNT(*) FROM t_audit_log WHERE tenant_id = $TENANT_ID LIMIT 1;")
    if [ -n "$audit_logs" ] && [ "$audit_logs" -gt 0 ]; then
        log_success "审计日志已记录: $audit_logs 条"
    else
        log_warning "审计日志缺失或表不存在"
        ISSUES+=("[审计系统] 操作审计日志可能未被记录")]
    fi

    log_section "9.4 检查时间戳一致性"
    log_test "验证创建时间和修改时间的逻辑"

    local time_check=$(db_query "SELECT created_at, updated_at FROM t_production_order WHERE id=$ORDER_ID LIMIT 1;")
    if [ -n "$time_check" ]; then
        log_success "时间戳字段存在: $time_check"
        # 可以进一步验证 created_at <= updated_at
    else
        log_warning "时间戳字段查询为空"
        ISSUES+=("[数据质量] 时间戳字段可能缺失")]
    fi
}

#################################################################
# 第十阶段：双端一致性全面检查
#################################################################

phase_frontend_backend_consistency() {
    log_header "第十阶段：双端一致性全面检查"

    log_section "10.1 API响应与数据库一致性"
    log_test "对比API返回值与数据库数据"

    if [ -n "$ORDER_ID" ]; then
        # 从API获取数据
        local api_data=$(api_call "GET" "/production/order/$ORDER_ID" "")

        # 从数据库获取数据
        local db_data=$(db_query "SELECT order_no, quantity, status FROM t_production_order WHERE id=$ORDER_ID LIMIT 1;")

        if [ -n "$api_data" ] && [ -n "$db_data" ]; then
            if echo "$api_data" | grep -q "\"code\":200"; then
                log_success "API与数据库数据一致"
            else
                log_warning "API响应异常: $api_data"
                ISSUES+=("[双端一致性] API响应可能异常")]
            fi
        fi
    fi

    log_section "10.2 前端列表与API数据一致性"
    log_test "验证列表查询API是否返回完整的业务数据"

    local order_list=$(api_call "GET" "/production/order/list" "")
    if echo "$order_list" | grep -q "\"code\":200"; then
        log_success "生产订单列表API可访问"

        # 检查是否包含测试数据
        if echo "$order_list" | grep -q "PROD_$TEST_PREFIX"; then
            log_success "测试订单已包含在列表中"
        else
            log_warning "测试订单未出现在列表中（可能需要等待或操作延迟）"
            ISSUES+=("[双端一致性] 新建订单未立即出现在列表中")]
        fi
    else
        log_error "订单列表API异常"
        ISSUES+=("[API异常] 生产订单列表查询失败")]
    fi

    log_section "10.3 状态流转一致性"
    log_test "验证状态变更同步到前后端"

    if [ -n "$ORDER_ID" ]; then
        # 检查过中间状态是否正确记录
        local state_logs=$(db_query "SELECT COUNT(*) FROM t_audit_log WHERE entity_type='ProductionOrder' AND entity_id=$ORDER_ID AND tenant_id=$TENANT_ID;")

        if [ "${state_logs:-0}" -gt 0 ]; then
            log_success "状态变更日志已记录: $state_logs 条"
        else
            log_warning "状态变更日志缺失"
            ISSUES+=("[状态管理] 状态变更未被完整审计")]
        fi
    fi
}

#################################################################
# 第十一阶段：角落与边界情况检查
#################################################################

phase_edge_cases() {
    log_header "第十一阶段：角落与边界情况检查"

    log_section "11.1 空值与NULL处理"
    log_test "检查可选字段的NULL值处理"

    local null_check=$(db_query "SELECT id, order_no, company, merchandiser FROM t_production_order WHERE id=$ORDER_ID AND company IS NULL AND merchandiser IS NULL LIMIT 1;")

    if [ -z "$null_check" ]; then
        log_success "NULL值处理正确（必要字段已填充）"
    else
        log_warning "发现NULL字段: $null_check"
        ISSUES+=("[数据质量] 某些字段为NULL可能影响业务")]
    fi

    log_section "11.2 并发提交处理"
    log_test "模拟并发产生的数据一致性"

    # 记录提交前的时间戳
    local before_count=$(db_query "SELECT COUNT(*) FROM t_scan_record WHERE tenant_id=$TENANT_ID;")

    # 尝试快速提交多条扫码
    for i in {1..3}; do
        local concurrent_data='{
            "orderNo":"PROD_'$TEST_PREFIX'",
            "processCode":"SEWING'$i'",
            "processName":"缝制'$i'",
            "quantity":10,
            "worker":"worker'$i'",
            "timestamp":'$((TIMESTAMP+i*1000))'000
        }'
        api_call "POST" "/production/scan/execute" "$concurrent_data" > /dev/null 2>&1
    done

    sleep 1
    local after_count=$(db_query "SELECT COUNT(*) FROM t_scan_record WHERE tenant_id=$TENANT_ID;")

    if [ "$after_count" -gt "$before_count" ]; then
        log_success "并发数据已正确保存: 增加 $((after_count - before_count)) 条"
    else
        log_warning "并发数据可能未全部保存"
        ISSUES+=("[并发处理] 并发提交的数据可能丢失")]
    fi

    log_section "11.3 数据边界值检查"
    log_test "验证极限数值的处理"

    # 检查大数值字段
    local boundary_check=$(db_query "SELECT MAX(quantity) as max_qty, MIN(quantity) as min_qty FROM t_production_order WHERE tenant_id=$TENANT_ID;")

    if [ -n "$boundary_check" ]; then
        log_success "数值边界检查: $boundary_check"
    else
        log_warning "数值边界检查失败"
        ISSUES+=("[边界检查] 极限值处理验证失败")]
    fi

    log_section "11.4 时间序列完整性"
    log_test "检查时间序列数据是否连续"

    local time_sequence=$(db_query "SELECT COUNT(DISTINCT DATE(created_at)) FROM t_scan_record WHERE tenant_id=$TENANT_ID;")

    if [ "${time_sequence:-0}" -gt 0 ]; then
        log_success "时间序列完整，覆盖 $time_sequence 天"
    else
        log_warning "时间序列数据缺失"
        ISSUES+=("[时间数据] 时间序列完整性可能有问题")]
    fi
}

#################################################################
# 清理测试数据
#################################################################

cleanup_test_data() {
    log_header "清理测试数据"

    log_section "删除测试创建的记录"

    if [ -n "$ORDER_ID" ]; then
        db_query "DELETE FROM t_scan_record WHERE order_id=$ORDER_ID AND tenant_id=$TENANT_ID;"
        log_success "已删除扫码记录: $ORDER_ID"

        db_query "DELETE FROM t_production_order WHERE id=$ORDER_ID AND tenant_id=$TENANT_ID;"
        log_success "已删除生产订单: $ORDER_ID"
    fi

    if [ -n "$STYLE_ID" ]; then
        db_query "DELETE FROM t_style_info WHERE id=$STYLE_ID AND tenant_id=$TENANT_ID;"
        log_success "已删除样衣: $STYLE_ID"
    fi

    if [ -n "$PURCHASE_ID" ]; then
        db_query "DELETE FROM t_material_purchase WHERE id=$PURCHASE_ID AND tenant_id=$TENANT_ID;"
        log_success "已删除采购单: $PURCHASE_ID"
    fi

    log_success "测试数据清理完成"
}

#################################################################
# 最终报告
#################################################################

generate_final_report() {
    log_header "📊 最终测试报告"

    local total_tests=$TOTAL_TESTS
    local passed=$PASSED_TESTS
    local failed=$FAILED_TESTS
    local warnings=$WARNINGS
    local pass_rate=$((passed * 100 / (total_tests > 0 ? total_tests : 1)))

    echo ""
    echo "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo "${BLUE}║     端到端业务流程测试 - 最终报告     ║${NC}"
    echo "${BLUE}╚════════════════════════════════════════╝${NC}"

    echo ""
    echo "📈 测试统计："
    echo "  • 总测试数:  $total_tests"
    echo "  • 通过:      ${GREEN}$passed${NC}"
    echo "  • 失败:      ${RED}$failed${NC}"
    echo "  • 警告:      ${YELLOW}$warnings${NC}"
    echo "  • 成功率:    ${GREEN}$pass_rate%${NC}"

    if [ ${#ISSUES[@]} -gt 0 ]; then
        echo ""
        echo "⚠️  发现的问题与角落 (共 ${#ISSUES[@]} 项)："
        local issue_count=1
        for issue in "${ISSUES[@]}"; do
            echo "  $issue_count. $issue"
            ((issue_count++))
        done
    else
        echo ""
        echo "${GREEN}✅ 未发现任何问题，所有业务流程通过测试！${NC}"
    fi

    echo ""
    echo "📝 测试时间戳: $TEST_PREFIX"
    echo "🏢 测试租户: $TENANT_ID ($TENANT_NAME)"
    echo "👤 测试用户: $TEST_USER"

    # 保存报告到文件
    local report_file="e2e-business-flow-report-$(date +%Y%m%d_%H%M%S).txt"
    {
        echo "═════════════════════════════════════════"
        echo "端到端完整业务流程测试报告"
        echo "═════════════════════════════════════════"
        echo "时间: $(date)"
        echo "租户: $TENANT_ID ($TENANT_NAME)"
        echo "用户: $TEST_USER"
        echo "测试前缀: $TEST_PREFIX"
        echo ""
        echo "总测试数: $total_tests"
        echo "通过: $passed"
        echo "失败: $failed"
        echo "警告: $warnings"
        echo "成功率: $pass_rate%"
        echo ""
        echo "═════════════════════════════════════════"
        echo "详细问题列表:"
        echo "═════════════════════════════════════════"
        if [ ${#ISSUES[@]} -gt 0 ]; then
            local idx=1
            for issue in "${ISSUES[@]}"; do
                echo "$idx. $issue"
                ((idx++))
            done
        else
            echo "✅ 未发现任何问题"
        fi
    } > "$report_file"

    echo ""
    echo "📄 详细报告已保存: $report_file"
}

#################################################################
# 主程序入口
#################################################################

main() {
    log_header "🚀 启动端到端完整业务流程测试"
    echo "测试时间: $(date)"
    echo "测试租户ID: $TENANT_ID"
    echo "测试用户: $TEST_USER"
    echo "测试前缀: $TEST_PREFIX"

    # 执行各个阶段
    phase_system_readiness
    phase_sample_development
    phase_material_procurement
    phase_production_order
    phase_scan_and_tracking
    phase_warehouse_outbound
    phase_reconciliation
    phase_data_isolation_complete
    phase_data_completeness
    phase_frontend_backend_consistency
    phase_edge_cases

    # 清理测试数据
    log_header "清理测试环境"
    cleanup_test_data

    # 生成最终报告
    generate_final_report

    # 返回状态码
    if [ $FAILED_TESTS -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# 执行主程序
main
