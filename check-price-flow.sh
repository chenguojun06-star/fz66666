#!/bin/bash

# ==============================================================================
# 价格流转完整性核查脚本
# 功能：检查所有业务环节的价格/成本数据是否正常流转
# 作者：系统管理员
# 日期：2026-02-08
# ==============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 数据库配置
DB_HOST="localhost"
DB_PORT="3308"
DB_NAME="fashion_supplychain"
DB_USER="root"
DB_PASS="changeme"

# 执行SQL查询
execute_sql() {
    local sql="$1"
    mysql -h${DB_HOST} -P${DB_PORT} -u${DB_USER} -p${DB_PASS} ${DB_NAME} -N -e "$sql" 2>/dev/null
}

# 打印分隔线
print_separator() {
    echo -e "${BLUE}============================================================${NC}"
}

# 打印节标题
print_section() {
    echo ""
    print_separator
    echo -e "${BLUE}$1${NC}"
    print_separator
}

# 打印成功信息
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# 打印警告信息
print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# 打印错误信息
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# 打印信息
print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# ==============================================================================
# 1. 款式报价单价核查
# ==============================================================================
check_style_quotation_prices() {
    print_section "1. 款式报价单价核查 (t_style_quotation)"

    local sql="
    SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN material_cost IS NOT NULL AND material_cost > 0 THEN 1 ELSE 0 END) as has_material_cost,
        SUM(CASE WHEN process_cost IS NOT NULL AND process_cost > 0 THEN 1 ELSE 0 END) as has_process_cost,
        SUM(CASE WHEN other_cost IS NOT NULL AND other_cost > 0 THEN 1 ELSE 0 END) as has_other_cost,
        SUM(CASE WHEN total_price IS NOT NULL AND total_price > 0 THEN 1 ELSE 0 END) as has_total_price
    FROM t_style_quotation
    WHERE delete_flag = 0;
    "

    local result=$(execute_sql "$sql")
    local total=$(echo "$result" | awk '{print $1}')
    local has_material=$(echo "$result" | awk '{print $2}')
    local has_process=$(echo "$result" | awk '{print $3}')
    local has_other=$(echo "$result" | awk '{print $4}')
    local has_total=$(echo "$result" | awk '{print $5}')

    print_info "总报价单数: $total"
    print_info "包含物料成本: $has_material"
    print_info "包含工序成本: $has_process"
    print_info "包含其他成本: $has_other"
    print_info "包含总报价: $has_total"

    if [ "$total" -gt 0 ]; then
        if [ "$has_total" -eq "$total" ]; then
            print_success "所有报价单都包含总报价"
        else
            print_warning "有 $((total - has_total)) 个报价单缺少总报价"
        fi
    else
        print_info "暂无报价单数据"
    fi
}

# ==============================================================================
# 2. 物料采购单价核查
# ==============================================================================
check_material_purchase_prices() {
    print_section "2. 物料采购单价核查 (t_material_purchase)"

    local sql="
    SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN unit_price IS NOT NULL AND unit_price > 0 THEN 1 ELSE 0 END) as has_unit_price,
        SUM(CASE WHEN total_amount IS NOT NULL AND total_amount > 0 THEN 1 ELSE 0 END) as has_total_amount,
        SUM(CASE WHEN unit_price IS NULL OR unit_price = 0 THEN 1 ELSE 0 END) as missing_unit_price,
        SUM(CASE WHEN total_amount IS NULL OR total_amount = 0 THEN 1 ELSE 0 END) as missing_total_amount
    FROM t_material_purchase
    WHERE delete_flag = 0;
    "

    local result=$(execute_sql "$sql")
    local total=$(echo "$result" | awk '{print $1}')
    local has_unit=$(echo "$result" | awk '{print $2}')
    local has_total=$(echo "$result" | awk '{print $3}')
    local missing_unit=$(echo "$result" | awk '{print $4}')
    local missing_total=$(echo "$result" | awk '{print $5}')

    print_info "总采购单数: $total"
    print_info "包含单价: $has_unit"
    print_info "包含总金额: $has_total"

    if [ "$missing_unit" -gt 0 ]; then
        print_error "有 $missing_unit 个采购单缺少单价！"
    else
        print_success "所有采购单都包含单价"
    fi

    if [ "$missing_total" -gt 0 ]; then
        print_warning "有 $missing_total 个采购单缺少总金额"
    else
        print_success "所有采购单都包含总金额"
    fi

    # 检查单价和总金额的一致性
    local sql_consistency="
    SELECT COUNT(*)
    FROM t_material_purchase
    WHERE delete_flag = 0
      AND unit_price IS NOT NULL AND unit_price > 0
      AND total_amount IS NOT NULL AND total_amount > 0
      AND ABS(total_amount - (unit_price * purchase_quantity)) > 0.01;
    "

    local inconsistent=$(execute_sql "$sql_consistency")
    if [ "$inconsistent" -gt 0 ]; then
        print_error "有 $inconsistent 个采购单的单价×数量 ≠ 总金额！"
    else
        print_success "所有采购单的价格计算一致"
    fi
}

# ==============================================================================
# 3. 物料库存单价核查
# ==============================================================================
check_material_stock_prices() {
    print_section "3. 物料库存单价核查 (t_material_stock)"

    local sql="
    SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN unit_price IS NOT NULL AND unit_price > 0 THEN 1 ELSE 0 END) as has_unit_price,
        SUM(CASE WHEN unit_price IS NULL OR unit_price = 0 THEN 1 ELSE 0 END) as missing_unit_price
    FROM t_material_stock;
    "

    local result=$(execute_sql "$sql")
    local total=$(echo "$result" | awk '{print $1}')
    local has_unit=$(echo "$result" | awk '{print $2}')
    local missing_unit=$(echo "$result" | awk '{print $3}')

    print_info "总库存记录数: $total"
    print_info "包含单价: $has_unit"

    if [ "$missing_unit" -gt 0 ]; then
        print_warning "有 $missing_unit 条库存记录缺少单价（可能是历史遗留数据）"
    else
        print_success "所有库存记录都包含单价"
    fi
}

# ==============================================================================
# 4. 物料对账单价核查
# ==============================================================================
check_material_reconciliation_prices() {
    print_section "4. 物料对账单价核查 (t_material_reconciliation)"

    local sql="
    SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN unit_price IS NOT NULL AND unit_price > 0 THEN 1 ELSE 0 END) as has_unit_price,
        SUM(CASE WHEN total_amount IS NOT NULL AND total_amount > 0 THEN 1 ELSE 0 END) as has_total_amount,
        SUM(CASE WHEN final_amount IS NOT NULL AND final_amount > 0 THEN 1 ELSE 0 END) as has_final_amount,
        SUM(CASE WHEN unit_price IS NULL OR unit_price = 0 THEN 1 ELSE 0 END) as missing_unit_price
    FROM t_material_reconciliation
    WHERE delete_flag = 0;
    "

    local result=$(execute_sql "$sql")
    local total=$(echo "$result" | awk '{print $1}')
    local has_unit=$(echo "$result" | awk '{print $2}')
    local has_total=$(echo "$result" | awk '{print $3}')
    local has_final=$(echo "$result" | awk '{print $4}')
    local missing_unit=$(echo "$result" | awk '{print $5}')

    print_info "总对账单数: $total"
    print_info "包含单价: $has_unit"
    print_info "包含总金额: $has_total"
    print_info "包含最终金额: $has_final"

    if [ "$missing_unit" -gt 0 ]; then
        print_error "有 $missing_unit 个对账单缺少单价！"
    else
        print_success "所有对账单都包含单价"
    fi

    # 检查价格一致性
    local sql_consistency="
    SELECT COUNT(*)
    FROM t_material_reconciliation
    WHERE delete_flag = 0
      AND unit_price IS NOT NULL AND unit_price > 0
      AND total_amount IS NOT NULL AND total_amount > 0
      AND ABS(total_amount - (unit_price * quantity)) > 0.01;
    "

    local inconsistent=$(execute_sql "$sql_consistency")
    if [ "$inconsistent" -gt 0 ]; then
        print_error "有 $inconsistent 个对账单的单价×数量 ≠ 总金额！"
    else
        print_success "所有对账单的价格计算一致"
    fi
}

# ==============================================================================
# 5. 生产订单工序单价核查
# ==============================================================================
check_production_order_process_prices() {
    print_section "5. 生产订单工序单价核查 (progress_nodes 字段)"

    local sql="
    SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN progress_nodes IS NOT NULL AND progress_nodes != '' THEN 1 ELSE 0 END) as has_progress_nodes,
        SUM(CASE WHEN progress_nodes IS NULL OR progress_nodes = '' THEN 1 ELSE 0 END) as missing_progress_nodes
    FROM t_production_order
    WHERE delete_flag = 0;
    "

    local result=$(execute_sql "$sql")
    local total=$(echo "$result" | awk '{print $1}')
    local has_nodes=$(echo "$result" | awk '{print $2}')
    local missing_nodes=$(echo "$result" | awk '{print $3}')

    print_info "总订单数: $total"
    print_info "包含进度节点: $has_nodes"

    if [ "$missing_nodes" -gt 0 ]; then
        print_warning "有 $missing_nodes 个订单缺少进度节点配置"
    else
        print_success "所有订单都配置了进度节点"
    fi

    # 检查进度节点中是否包含单价（通过JSON检查，需要MySQL 5.7+）
    local sql_check_unit_price="
    SELECT production_order_no
    FROM t_production_order
    WHERE delete_flag = 0
      AND progress_nodes IS NOT NULL
      AND progress_nodes != ''
      AND progress_nodes NOT LIKE '%unitPrice%'
    LIMIT 5;
    "

    local missing_unit_price=$(execute_sql "$sql_check_unit_price" | wc -l | tr -d ' ')
    if [ "$missing_unit_price" -gt 0 ]; then
        print_warning "发现部分订单的进度节点缺少 unitPrice 字段"
        print_info "示例订单号: $(execute_sql "$sql_check_unit_price" | head -n 3 | tr '\n' ' ')"
    else
        print_success "所有订单的进度节点都包含 unitPrice 字段"
    fi
}

# ==============================================================================
# 6. 扫码记录单价核查
# ==============================================================================
check_scan_record_prices() {
    print_section "6. 扫码记录单价核查 (t_scan_record)"

    local sql="
    SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN unit_price IS NOT NULL AND unit_price > 0 THEN 1 ELSE 0 END) as has_unit_price,
        SUM(CASE WHEN total_amount IS NOT NULL AND total_amount > 0 THEN 1 ELSE 0 END) as has_total_amount,
        SUM(CASE WHEN unit_price IS NULL OR unit_price = 0 THEN 1 ELSE 0 END) as missing_unit_price
    FROM t_scan_record;
    "

    local result=$(execute_sql "$sql")
    local total=$(echo "$result" | awk '{print $1}')
    local has_unit=$(echo "$result" | awk '{print $2}')
    local has_total=$(echo "$result" | awk '{print $3}')
    local missing_unit=$(echo "$result" | awk '{print $4}')

    print_info "总扫码记录数: $total"
    print_info "包含单价: $has_unit"
    print_info "包含总金额: $has_total"

    if [ "$total" -gt 0 ]; then
        local missing_percent=$(awk "BEGIN {printf \"%.1f\", ($missing_unit/$total)*100}")
        if [ "$missing_unit" -gt 0 ]; then
            print_warning "有 $missing_unit 条扫码记录缺少单价 (${missing_percent}%)"
            print_info "这可能是早期未配置工序单价的订单"
        else
            print_success "所有扫码记录都包含单价"
        fi
    else
        print_info "暂无扫码记录"
    fi

    # 检查价格一致性
    if [ "$has_unit" -gt 0 ]; then
        local sql_consistency="
        SELECT COUNT(*)
        FROM t_scan_record
        WHERE unit_price IS NOT NULL AND unit_price > 0
          AND total_amount IS NOT NULL AND total_amount > 0
          AND quantity IS NOT NULL AND quantity > 0
          AND ABS(total_amount - (unit_price * quantity)) > 0.01;
        "

        local inconsistent=$(execute_sql "$sql_consistency")
        if [ "$inconsistent" -gt 0 ]; then
            print_error "有 $inconsistent 条扫码记录的单价×数量 ≠ 总金额！"
        else
            print_success "所有扫码记录的价格计算一致"
        fi
    fi
}

# ==============================================================================
# 7. 工序跟踪单价核查
# ==============================================================================
check_process_tracking_prices() {
    print_section "7. 工序跟踪单价核查 (t_production_process_tracking)"

    # 检查表是否存在
    local table_exists=$(execute_sql "SHOW TABLES LIKE 't_production_process_tracking';" | wc -l | tr -d ' ')

    if [ "$table_exists" -eq 0 ]; then
        print_warning "工序跟踪表 t_production_process_tracking 不存在！"
        print_info "请先运行初始化脚本: ./init-process-tracking.sh"
        return
    fi

    local sql="
    SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN unit_price IS NOT NULL AND unit_price > 0 THEN 1 ELSE 0 END) as has_unit_price,
        SUM(CASE WHEN settlement_amount IS NOT NULL AND settlement_amount > 0 THEN 1 ELSE 0 END) as has_settlement_amount,
        SUM(CASE WHEN unit_price IS NULL OR unit_price = 0 THEN 1 ELSE 0 END) as missing_unit_price,
        SUM(CASE WHEN scan_status = 'scanned' THEN 1 ELSE 0 END) as scanned_count,
        SUM(CASE WHEN is_settled = 1 THEN 1 ELSE 0 END) as settled_count
    FROM t_production_process_tracking;
    "

    local result=$(execute_sql "$sql")
    local total=$(echo "$result" | awk '{print $1}')
    local has_unit=$(echo "$result" | awk '{print $2}')
    local has_settlement=$(echo "$result" | awk '{print $3}')
    local missing_unit=$(echo "$result" | awk '{print $4}')
    local scanned=$(echo "$result" | awk '{print $5}')
    local settled=$(echo "$result" | awk '{print $6}')

    print_info "总跟踪记录数: $total"
    print_info "包含单价: $has_unit"
    print_info "包含结算金额: $has_settlement"
    print_info "已扫码: $scanned"
    print_info "已结算: $settled"

    if [ "$total" -gt 0 ]; then
        if [ "$missing_unit" -gt 0 ]; then
            print_warning "有 $missing_unit 条跟踪记录缺少单价（可能是早期订单）"
        else
            print_success "所有跟踪记录都包含单价"
        fi

        # 检查已扫码但未计算结算金额的记录
        local sql_missing_settlement="
        SELECT COUNT(*)
        FROM t_production_process_tracking
        WHERE scan_status = 'scanned'
          AND unit_price IS NOT NULL AND unit_price > 0
          AND quantity IS NOT NULL AND quantity > 0
          AND (settlement_amount IS NULL OR settlement_amount = 0);
        "

        local missing_settlement=$(execute_sql "$sql_missing_settlement")
        if [ "$missing_settlement" -gt 0 ]; then
            print_error "有 $missing_settlement 条已扫码记录未计算结算金额！"
        else
            print_success "所有已扫码记录都已计算结算金额"
        fi

        # 检查结算金额计算一致性
        local sql_consistency="
        SELECT COUNT(*)
        FROM t_production_process_tracking
        WHERE settlement_amount IS NOT NULL AND settlement_amount > 0
          AND unit_price IS NOT NULL AND unit_price > 0
          AND quantity IS NOT NULL AND quantity > 0
          AND ABS(settlement_amount - (unit_price * quantity)) > 0.01;
        "

        local inconsistent=$(execute_sql "$sql_consistency")
        if [ "$inconsistent" -gt 0 ]; then
            print_error "有 $inconsistent 条跟踪记录的单价×数量 ≠ 结算金额！"
        else
            print_success "所有跟踪记录的结算金额计算一致"
        fi
    else
        print_info "暂无工序跟踪记录"
    fi
}

# ==============================================================================
# 8. 数据流转关联性检查
# ==============================================================================
check_data_flow_correlation() {
    print_section "8. 数据流转关联性检查"

    # 8.1 检查物料采购 → 物料对账的价格流转
    print_info "8.1 检查 物料采购 → 物料对账 价格流转..."
    local sql_purchase_to_recon="
    SELECT COUNT(*)
    FROM t_material_purchase mp
    LEFT JOIN t_material_reconciliation mr ON mp.id = mr.purchase_id
    WHERE mp.delete_flag = 0
      AND mp.unit_price IS NOT NULL AND mp.unit_price > 0
      AND mr.id IS NOT NULL
      AND (mr.unit_price IS NULL OR mr.unit_price = 0);
    "

    local purchase_recon_missing=$(execute_sql "$sql_purchase_to_recon")
    if [ "$purchase_recon_missing" -gt 0 ]; then
        print_error "有 $purchase_recon_missing 个采购单的单价未流转到对账单！"
    else
        print_success "物料采购 → 物料对账 价格流转正常"
    fi

    # 8.2 检查扫码记录 → 工序跟踪的价格流转
    print_info "8.2 检查 扫码记录 → 工序跟踪 价格流转..."

    # 检查表是否存在
    local table_exists=$(execute_sql "SHOW TABLES LIKE 't_production_process_tracking';" | wc -l | tr -d ' ')

    if [ "$table_exists" -eq 1 ]; then
        local sql_scan_to_tracking="
        SELECT COUNT(*)
        FROM t_scan_record sr
        INNER JOIN t_production_process_tracking pt ON sr.id = pt.scan_record_id
        WHERE sr.unit_price IS NOT NULL AND sr.unit_price > 0
          AND (pt.unit_price IS NULL OR pt.unit_price = 0 OR pt.settlement_amount IS NULL OR pt.settlement_amount = 0);
        "

        local scan_tracking_missing=$(execute_sql "$sql_scan_to_tracking")
        if [ "$scan_tracking_missing" -gt 0 ]; then
            print_error "有 $scan_tracking_missing 条扫码记录的单价未流转到工序跟踪！"
        else
            print_success "扫码记录 → 工序跟踪 价格流转正常"
        fi
    else
        print_warning "工序跟踪表不存在，跳过此检查"
    fi
}

# ==============================================================================
# 9. 价格缺失数据明细查询
# ==============================================================================
show_missing_price_details() {
    print_section "9. 价格缺失数据明细（TOP 10）"

    # 9.1 缺少单价的物料采购
    print_info "9.1 缺少单价的物料采购单..."
    local sql_missing_purchase="
    SELECT
        purchase_no as '采购单号',
        material_name as '物料名称',
        purchase_quantity as '数量',
        supplier_name as '供应商',
        order_no as '订单号'
    FROM t_material_purchase
    WHERE delete_flag = 0
      AND (unit_price IS NULL OR unit_price = 0)
    ORDER BY create_time DESC
    LIMIT 10;
    "

    local missing_purchase=$(execute_sql "$sql_missing_purchase" 2>/dev/null)
    if [ -n "$missing_purchase" ]; then
        echo "$missing_purchase" | column -t -s $'\t'
    else
        print_success "无缺少单价的采购单"
    fi

    # 9.2 缺少单价的扫码记录
    print_info ""
    print_info "9.2 缺少单价的扫码记录..."
    local sql_missing_scan="
    SELECT
        order_no as '订单号',
        process_name as '工序',
        quantity as '数量',
        operator_name as '操作人',
        DATE_FORMAT(scan_time, '%Y-%m-%d %H:%i') as '扫码时间'
    FROM t_scan_record
    WHERE (unit_price IS NULL OR unit_price = 0)
      AND scan_result = 'success'
    ORDER BY scan_time DESC
    LIMIT 10;
    "

    local missing_scan=$(execute_sql "$sql_missing_scan" 2>/dev/null)
    if [ -n "$missing_scan" ]; then
        echo "$missing_scan" | column -t -s $'\t'
    else
        print_success "无缺少单价的扫码记录"
    fi
}

# ==============================================================================
# 10. 生成核查报告
# ==============================================================================
generate_report() {
    print_section "10. 核查汇总报告"

    # 统计所有问题
    local total_issues=0

    # 物料采购缺少单价
    local purchase_missing=$(execute_sql "SELECT COUNT(*) FROM t_material_purchase WHERE delete_flag = 0 AND (unit_price IS NULL OR unit_price = 0);")
    if [ "$purchase_missing" -gt 0 ]; then
        print_error "物料采购缺少单价: $purchase_missing 条"
        total_issues=$((total_issues + purchase_missing))
    fi

    # 物料对账缺少单价
    local recon_missing=$(execute_sql "SELECT COUNT(*) FROM t_material_reconciliation WHERE delete_flag = 0 AND (unit_price IS NULL OR unit_price = 0);")
    if [ "$recon_missing" -gt 0 ]; then
        print_error "物料对账缺少单价: $recon_missing 条"
        total_issues=$((total_issues + recon_missing))
    fi

    # 扫码记录缺少单价
    local scan_missing=$(execute_sql "SELECT COUNT(*) FROM t_scan_record WHERE scan_result = 'success' AND (unit_price IS NULL OR unit_price = 0);")
    if [ "$scan_missing" -gt 0 ]; then
        print_warning "扫码记录缺少单价: $scan_missing 条（可能是早期数据）"
    fi

    # 工序跟踪缺少单价
    local table_exists=$(execute_sql "SHOW TABLES LIKE 't_production_process_tracking';" | wc -l | tr -d ' ')
    if [ "$table_exists" -eq 1 ]; then
        local tracking_missing=$(execute_sql "SELECT COUNT(*) FROM t_production_process_tracking WHERE (unit_price IS NULL OR unit_price = 0);")
        if [ "$tracking_missing" -gt 0 ]; then
            print_warning "工序跟踪缺少单价: $tracking_missing 条"
        fi

        # 已扫码但未计算结算金额
        local settlement_missing=$(execute_sql "SELECT COUNT(*) FROM t_production_process_tracking WHERE scan_status = 'scanned' AND unit_price IS NOT NULL AND unit_price > 0 AND (settlement_amount IS NULL OR settlement_amount = 0);")
        if [ "$settlement_missing" -gt 0 ]; then
            print_error "已扫码但未计算结算金额: $settlement_missing 条"
            total_issues=$((total_issues + settlement_missing))
        fi
    fi

    echo ""
    print_separator
    if [ "$total_issues" -eq 0 ]; then
        print_success "✓ 价格流转检查通过！所有关键数据完整。"
    else
        print_error "发现 $total_issues 个需要修复的问题！"
        print_info "建议："
        print_info "1. 检查物料采购单，确保录入时填写单价"
        print_info "2. 检查生产订单的进度节点配置，确保包含 unitPrice"
        print_info "3. 运行修复脚本补全历史数据"
        print_info "4. 如果工序跟踪表缺少数据，运行: ./init-process-tracking.sh"
    fi
    print_separator
}

# ==============================================================================
# 主函数
# ==============================================================================
main() {
    clear
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║          价格流转完整性核查脚本 v1.0                          ║"
    echo "║          检查所有业务环节的价格/成本数据流转                  ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # 检查数据库连接
    print_info "正在连接数据库..."
    if ! execute_sql "SELECT 1;" > /dev/null 2>&1; then
        print_error "数据库连接失败！请检查配置。"
        exit 1
    fi
    print_success "数据库连接成功"

    # 执行检查
    check_style_quotation_prices
    check_material_purchase_prices
    check_material_stock_prices
    check_material_reconciliation_prices
    check_production_order_process_prices
    check_scan_record_prices
    check_process_tracking_prices
    check_data_flow_correlation
    show_missing_price_details
    generate_report

    echo ""
    print_info "核查完成！如需修复问题，请根据建议执行相应操作。"
}

# 运行主函数
main
