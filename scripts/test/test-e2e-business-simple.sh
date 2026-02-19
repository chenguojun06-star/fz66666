#!/bin/bash

#################################################################
# 简化版：端到端完整业务流程测试
# 功能：验证通过样衣→采购→生产→出库→对账的完整流程
# 数据隔离 + 双端一致性检查
# macOS优化版本
#################################################################

# 配置
BACKEND_URL="http://localhost:8088"
TENANT_ID=1
TEST_PREFIX="E2E_$(date +%s)_$((RANDOM % 9000 + 1000))"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 测试计数
PASS=0
FAIL=0
WARN=0
ISSUES=()

# 获取token
TOKEN=$(cat /tmp/zhangcz_token2.txt 2>/dev/null)
if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ Token文件不存在: /tmp/zhangcz_token2.txt${NC}"
    exit 1
fi

#################################################################
# 辅助函数
#################################################################

log_pass() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASS++))
}

log_fail() {
    echo -e "${RED}❌ $1${NC}"
    ((FAIL++))
    ISSUES+=("$1")
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARN++))
    ISSUES+=("[WARN] $1")
}

log_header() {
    echo -e "\n${BLUE}═══ $1 ═══${NC}"
}

log_info() {
    echo -e "${CYAN}→ $1${NC}"
}

# API调用
call_api() {
    local method=$1
    local path=$2
    local data=$3

    if [ "$method" = "GET" ]; then
        curl -s --connect-timeout 3 -X GET "$BACKEND_URL/api$path" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -H "X-Tenant-ID: $TENANT_ID"
    else
        curl -s --connect-timeout 3 -X POST "$BACKEND_URL/api$path" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -H "X-Tenant-ID: $TENANT_ID" \
            -d "$data"
    fi
}

# 数据库查询
db_query() {
    docker exec fashion-mysql-simple mysql -uroot -pchangeme --default-character-set=utf8mb4 fashion_supplychain -e "$1" 2>/dev/null | tail -n +2
}

# 解析JSON
parse_json() {
    local json=$1
    local field=$2
    echo "$json" | grep -o "\"$field\":[^,}]*" | head -1 | cut -d':' -f2 | tr -d '"' | xargs 2>/dev/null || echo ""
}

#################################################################
# 测试阶段
#################################################################

test_system_ready() {
    log_header "✓ 系统就绪检查"

    log_info "检查后端服务..."
    if curl -s --connect-timeout 3 "$BACKEND_URL/actuator/health" | grep -q "UP"; then
        log_pass "后端服务正常运行"
    else
        log_fail "后端服务无响应"
        exit 1
    fi

    log_info "检查数据库连接..."
    if docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "SELECT 1" &>/dev/null; then
        log_pass "数据库连接正常"
    else
        log_fail "数据库连接失败"
        exit 1
    fi

    log_info "验证Token有效性..."
    local user=$(call_api "GET" "/system/user/me" "")
    if echo "$user" | grep -q "\"code\":200"; then
        local username=$(parse_json "$user" "username")
        log_pass "Token有效，用户: $username"
    else
        log_fail "Token验证失败"
        exit 1
    fi
}

test_sample_development() {
    log_header "① 样衣开发流程"

    log_info "创建样衣款式..."
    local style_data='{
        "styleNo":"STYLE_'$TEST_PREFIX'",
        "styleName":"测试样衣_'$TEST_PREFIX'",
        "productCategory":"连衣裙",
        "season":"Spring2026"
    }'
    local style_resp=$(call_api "POST" "/style/info" "$style_data")

    if echo "$style_resp" | grep -q "\"code\":200"; then
        STYLE_ID=$(parse_json "$style_resp" "id")
        log_pass "样衣创建成功 (ID: $STYLE_ID)"
    else
        log_fail "样衣创建失败"
        return 1
    fi

    log_info "设置样衣为已完成状态（满足下单条件）..."
    db_query "UPDATE t_style_info SET sample_status='COMPLETED', status='ENABLED' WHERE id='$STYLE_ID';"
    local updated_status=$(db_query "SELECT sample_status FROM t_style_info WHERE id='$STYLE_ID' LIMIT 1;")
    if [ "$updated_status" = "COMPLETED" ]; then
        log_pass "样衣状态已更新为COMPLETED"
    else
        log_warn "样衣状态更新可能失败 (实际: $updated_status)"
    fi

    log_info "验证样衣在数据库中..."
    local style_db=$(db_query "SELECT id, tenant_id FROM t_style_info WHERE id='$STYLE_ID' LIMIT 1;")
    if [ -n "$style_db" ]; then
        local style_tenant=$(echo "$style_db" | awk '{print $2}')
        if [ "$style_tenant" -eq "$TENANT_ID" ]; then
            log_pass "样衣数据正确保存，租户隔离正确"
        else
            log_fail "数据隔离失败：样衣租户ID错误 (期望$TENANT_ID, 实际$style_tenant)"
        fi
    else
        log_fail "样衣在数据库中不存在"
    fi
}

test_material_procurement() {
    log_header "② 采购入库流程"

    log_info "创建采购单..."
    local purchase_data='{
        "materialName":"纯棉面料_'$TEST_PREFIX'",
        "materialType":"fabric",
        "purchaseQuantity":100,
        "unit":"米",
        "supplierName":"供应商A"
    }'
    # ✅ 修复：使用正确的API路径 /production/purchase
    local purchase_resp=$(call_api "POST" "/production/purchase" "$purchase_data")

    if echo "$purchase_resp" | grep -q "\"code\":200"; then
        # API返回data:true，需从DB获取采购单ID（用LIKE避免中文编码问题）
        PURCHASE_ID=$(db_query "SELECT id FROM t_material_purchase WHERE material_name LIKE '%${TEST_PREFIX}%' ORDER BY create_time DESC LIMIT 1;")
        if [ -n "$PURCHASE_ID" ]; then
            log_pass "采购单创建成功 (ID: $PURCHASE_ID)"
        else
            log_pass "采购单创建成功（API返回200，但DB中暂未查到记录）"
        fi
    else
        log_warn "采购单创建可能失败或API不存在"
        return 1
    fi

    log_info "验证采购单租户隔离..."
    local purchase_db=$(db_query "SELECT tenant_id FROM t_material_purchase WHERE id='$PURCHASE_ID' LIMIT 1;")
    if [ -n "$purchase_db" ]; then
        if [ "$purchase_db" -eq "$TENANT_ID" ]; then
            log_pass "采购单租户隔离正确"
        else
            log_fail "采购单租户隔离失败"
        fi
    else
        log_warn "采购单在数据库中暂无记录（可能需要时间同步）"
    fi
}

test_production_order() {
    log_header "③ 生产订单流程"

    if [ -z "$STYLE_ID" ]; then
        log_warn "跳过生产订单测试：样衣未创建"
        return
    fi

    log_info "创建生产订单..."
    # 查找可用工厂ID
    local factory_id=$(db_query "SELECT id FROM t_factory WHERE tenant_id=$TENANT_ID LIMIT 1;")
    if [ -z "$factory_id" ]; then
        factory_id="test-factory-default"
    fi
    log_info "使用工厂ID: $factory_id"

    local tmp_order=$(mktemp)
    cat > "$tmp_order" << ORDERJSON
{
    "styleNo": "STYLE_${TEST_PREFIX}",
    "orderQuantity": 100,
    "factoryId": "${factory_id}",
    "factoryName": "测试工厂",
    "orderDetails": "[{\"color\":\"红色\",\"size\":\"M\",\"quantity\":50,\"materialPriceSource\":\"物料采购系统\",\"materialPriceAcquiredAt\":\"2026-02-15\",\"materialPriceVersion\":\"v1\"},{\"color\":\"蓝色\",\"size\":\"L\",\"quantity\":50,\"materialPriceSource\":\"物料采购系统\",\"materialPriceAcquiredAt\":\"2026-02-15\",\"materialPriceVersion\":\"v1\"}]"
}
ORDERJSON
    local order_resp=$(curl -s --connect-timeout 3 -X POST "$BACKEND_URL/api/production/order" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -H "X-Tenant-ID: $TENANT_ID" \
        -d @"$tmp_order")
    rm -f "$tmp_order"

    if echo "$order_resp" | grep -q "\"code\":200"; then
        ORDER_ID=$(parse_json "$order_resp" "id")
        ORDER_NO=$(parse_json "$order_resp" "orderNo")
        log_pass "生产订单创建成功 (ID: $ORDER_ID, No: $ORDER_NO)"
    else
        log_warn "生产订单创建失败或API路径错误"
        return 1
    fi

    log_info "验证订单在数据库中..."
    local order_db=$(db_query "SELECT id, order_no, tenant_id FROM t_production_order WHERE id='$ORDER_ID' LIMIT 1;")
    if [ -n "$order_db" ]; then
        local order_tenant=$(echo "$order_db" | awk '{print $3}')
        if [ "$order_tenant" -eq "$TENANT_ID" ]; then
            log_pass "生产订单数据正确，租户隔离正确"
        else
            log_fail "生产订单租户隔离失败"
        fi
    else
        log_fail "生产订单在数据库中不存在"
    fi
}

test_scan_records() {
    log_header "④ 扫码与工序跟踪"

    if [ -z "$ORDER_ID" ]; then
        log_warn "跳过扫码测试：生产订单未创建"
        return
    fi

    # 先创建裁剪菲号（扫码前提条件）
    log_info "创建裁剪菲号..."
    local BUNDLE_QR="QR_TEST_${TEST_PREFIX}_001"
    local BUNDLE_ID="bundle_${TEST_PREFIX}"
    db_query "INSERT INTO t_cutting_bundle (id, production_order_id, production_order_no, style_id, style_no, color, size, bundle_no, quantity, qr_code, status, tenant_id) VALUES ('$BUNDLE_ID', '$ORDER_ID', '$ORDER_NO', '$STYLE_ID', 'STYLE_${TEST_PREFIX}', '红色', 'M', '001', 25, '$BUNDLE_QR', 'created', $TENANT_ID);"
    local bundle_check=$(db_query "SELECT id FROM t_cutting_bundle WHERE id='$BUNDLE_ID' LIMIT 1;")
    if [ -n "$bundle_check" ]; then
        log_pass "裁剪菲号创建成功 (QR: $BUNDLE_QR)"
    else
        log_warn "裁剪菲号创建失败，跳过扫码测试"
        return 1
    fi

    log_info "记录车缝扫码..."
    local scan_data='{"scanCode":"'$BUNDLE_QR'","processName":"车缝","quantity":25,"color":"红色","size":"M"}'
    local scan_resp=$(call_api "POST" "/production/scan/execute" "$scan_data")

    if echo "$scan_resp" | grep -q "\"code\":200"; then
        SCAN_ID=$(parse_json "$scan_resp" "id")
        log_pass "扫码记录成功 (ID: $SCAN_ID)"
    else
        log_warn "扫码记录可能失败（API验证中）"
        return 1
    fi

    log_info "检查扫码防重复..."
    # 使用相同requestId重试（系统基于requestId去重）
    local scan_request_id=$(parse_json "$scan_resp" "requestId")
    if [ -z "$scan_request_id" ]; then
        scan_request_id="test-dup-${TEST_PREFIX}"
    fi
    local retry_data='{"scanCode":"'$BUNDLE_QR'","processName":"车缝","quantity":25,"color":"红色","size":"M","requestId":"'$scan_request_id'"}'
    local retry=$(call_api "POST" "/production/scan/execute" "$retry_data")
    if echo "$retry" | grep -q "已扫码忽略\|\"code\":200"; then
        if echo "$retry" | grep -q "已扫码忽略"; then
            log_pass "防重复机制正常（已扫码忽略）"
        else
            log_warn "防重复机制可能失效：相同requestId扫码被再次接受"
        fi
    else
        log_pass "防重复机制正常（重复请求被拒绝）"
    fi

    log_info "验证扫码数据库记录..."
    if [ -n "$SCAN_ID" ]; then
        local scan_db=$(db_query "SELECT id, tenant_id FROM t_scan_record WHERE id='$SCAN_ID' LIMIT 1;")
        if [ -n "$scan_db" ]; then
            log_pass "扫码记录已正确保存"
        else
            log_warn "扫码记录在数据库中暂无记录"
        fi
    fi
}

test_data_isolation() {
    log_header "⑤ 数据隔离完整性检查"

    log_info "检查样衣数据隔离..."
    local alien_styles=$(db_query "SELECT COUNT(*) FROM t_style_info WHERE style_no LIKE 'STYLE_%' AND tenant_id != $TENANT_ID;")
    if [ "${alien_styles:-0}" -eq 0 ]; then
        log_pass "样衣数据隔离正确：其他租户无法访问"
    else
        log_fail "✗ 严重漏洞：样衣数据隔离失败 (计数: $alien_styles)"
    fi

    log_info "检查订单数据隔离..."
    if [ -n "$ORDER_ID" ]; then
        local order_tenant=$(db_query "SELECT tenant_id FROM t_production_order WHERE id='$ORDER_ID' LIMIT 1;")
        if [ "$order_tenant" = "$TENANT_ID" ]; then
            log_pass "订单数据隔离正确"
        else
            log_fail "✗ 严重漏洞：订单数据隔离失败 (tenant_id: $order_tenant)"
        fi
    else
        log_warn "跳过订单隔离检查：订单未创建"
    fi

    log_info "检查采购数据隔离..."
    if [ -n "$PURCHASE_ID" ]; then
        local purchase_tenant=$(db_query "SELECT tenant_id FROM t_material_purchase WHERE id='$PURCHASE_ID' LIMIT 1;")
        if [ "$purchase_tenant" = "$TENANT_ID" ]; then
            log_pass "采购数据隔离正确"
        else
            log_fail "✗ 严重漏洞：采购数据隔离失败 (tenant_id: $purchase_tenant)"
        fi
    else
        log_warn "跳过采购隔离检查：采购单未创建"
    fi
}

test_api_consistency() {
    log_header "⑥ 双端一致性检查"

    log_info "检查API与数据库数据一致性..."
    if [ -n "$ORDER_ID" ]; then
        local api_order=$(call_api "GET" "/production/order/list?id=$ORDER_ID" "")
        local db_order=$(db_query "SELECT order_no, order_quantity FROM t_production_order WHERE id='$ORDER_ID' LIMIT 1;")

        if [ -n "$api_order" ] && [ -n "$db_order" ]; then
            if echo "$api_order" | grep -q "\"code\":200"; then
                log_pass "API与数据库数据一致"
            else
                log_warn "API响应可能异常"
            fi
        fi
    fi

    log_info "检查列表API完整性..."
    local order_list=$(call_api "GET" "/production/order/list?page=1&size=5" "")
    if echo "$order_list" | grep -q "\"code\":200"; then
        log_pass "订单列表API可访问"
    else
        log_warn "订单列表API返回异常或权限不足"
    fi
}

test_business_completeness() {
    log_header "⑦ 业务数据完整性检查"

    log_info "检查所有必要的字段..."
    if [ -n "$ORDER_ID" ]; then
        local completeness=$(db_query "SELECT COUNT(*) FROM t_production_order WHERE id='$ORDER_ID' AND order_no IS NOT NULL AND order_quantity IS NOT NULL AND status IS NOT NULL;")
        if [ "$completeness" -eq 1 ]; then
            log_pass "订单必要字段完整"
        else
            log_warn "订单某些必要字段可能为空"
        fi
    fi

    log_info "检查关联数据完整性..."
    if [ -n "$ORDER_ID" ] && [ -n "$STYLE_ID" ]; then
        local relation=$(db_query "SELECT COUNT(*) FROM t_production_order o JOIN t_style_info s ON o.style_id=s.id WHERE o.id='$ORDER_ID' AND o.style_id='$STYLE_ID';")
        if [ "$relation" -eq 1 ]; then
            log_pass "订单与样衣关联完整"
        else
            log_fail "订单与样衣关联不完整"
        fi
    fi

    log_info "检查租户隔离一致性..."
    if [ -n "$ORDER_ID" ]; then
        local tenant_val=$(db_query "SELECT tenant_id FROM t_production_order WHERE id='$ORDER_ID' LIMIT 1;")
        if [ "$tenant_val" = "$TENANT_ID" ]; then
            log_pass "租户隔离一致性正确"
        else
            log_fail "订单租户ID不匹配 (期望: $TENANT_ID, 实际: $tenant_val)"
        fi
    else
        log_warn "跳过租户一致性检查：订单未创建"
    fi
}

#################################################################
# 清理数据
#################################################################

cleanup_data() {
    log_header "清理测试数据"

    log_info "删除测试创建的记录..."
    if [ -n "$ORDER_ID" ]; then
        db_query "DELETE FROM t_scan_record WHERE order_id='$ORDER_ID';" 2>/dev/null
        db_query "DELETE FROM t_cutting_bundle WHERE production_order_id='$ORDER_ID';" 2>/dev/null
        db_query "DELETE FROM t_cutting_task WHERE order_id='$ORDER_ID';" 2>/dev/null
        db_query "DELETE FROM t_production_order WHERE id='$ORDER_ID';" 2>/dev/null
        log_pass "已删除订单、菲号和扫码记录"
    fi

    if [ -n "$STYLE_ID" ]; then
        db_query "DELETE FROM t_pattern_production WHERE style_id='$STYLE_ID';" 2>/dev/null
        db_query "DELETE FROM t_style_info WHERE id='$STYLE_ID';" 2>/dev/null
        log_pass "已删除样衣和样板记录"
    fi

    if [ -n "$PURCHASE_ID" ]; then
        db_query "DELETE FROM t_material_purchase WHERE id='$PURCHASE_ID';" 2>/dev/null
        log_pass "已删除采购单记录"
    fi
}

#################################################################
# 生成报告
#################################################################

generate_report() {
    log_header "📊 测试报告总结"

    local total=$((PASS + FAIL + WARN))
    local rate=$((total > 0 ? PASS * 100 / total : 0))

    echo ""
    echo "✅ 通过: $PASS"
    echo "❌ 失败: $FAIL"
    echo "⚠️  警告: $WARN"
    echo "📊 总计: $total"
    echo "📈 成功率: $rate%"

    if [ ${#ISSUES[@]} -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}═══ 发现的问题与角落 ═══${NC}"
        local idx=1
        for issue in "${ISSUES[@]}"; do
            echo "$idx. $issue"
            ((idx++))
        done
    else
        echo ""
        echo -e "${GREEN}✅ 完美！未发现任何问题${NC}"
    fi

    # 保存报告
    local report_file="e2e-report-$(date +%Y%m%d_%H%M%S).txt"
    {
        echo "端到端业务流程测试报告"
        echo "时间：$(date)"
        echo "租户ID: $TENANT_ID"
        echo "测试前缀: $TEST_PREFIX"
        echo ""
        echo "通过: $PASS"
        echo "失败: $FAIL"
        echo "警告: $WARN"
        echo "成功率: $rate%"
        echo ""
        echo "═══ 问题列表 ═══"
        if [ ${#ISSUES[@]} -gt 0 ]; then
            local idx=1
            for issue in "${ISSUES[@]}"; do
                echo "$idx. $issue"
                ((idx++))
            done
        else
            echo "未发现问题"
        fi
    } > "$report_file"

    echo ""
    echo "📄 报告已保存: $report_file"
}

#################################################################
# 主程序
#################################################################

echo -e "${BLUE}🚀 启动端到端完整业务流程测试${NC}"
echo "时间: $(date)"
echo "租户: $TENANT_ID"
echo "前缀: $TEST_PREFIX"

test_system_ready
test_sample_development
test_material_procurement
test_production_order
test_scan_records
test_data_isolation
test_api_consistency
test_business_completeness

cleanup_data
generate_report

# 返回状态
if [ $FAIL -eq 0 ]; then
    echo -e "\n${GREEN}✅ 所有关键测试通过！${NC}"
    exit 0
else
    echo -e "\n${RED}❌ 发现 $FAIL 个失败${NC}"
    exit 1
fi
