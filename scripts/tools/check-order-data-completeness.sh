#!/bin/bash

# 订单数据完整性检查Shell脚本
# 生成时间: 2026-02-15

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}  订单数据完整性检查报告${NC}"
echo -e "${BLUE}  执行时间: $(date +'%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# 数据库连接信息
DB_HOST="localhost"
DB_PORT="3308"
DB_NAME="fashion_supplychain"
DB_USER="root"
DB_PASS="changeme"

# 执行SQL查询的辅助函数
run_sql() {
    local sql="$1"
    docker exec fashion-mysql-simple mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "$sql" 2>&1 | grep -v Warning | grep -v mysql
}

# 1. 检查数据库连接
echo -e "${YELLOW}[1/7] 检查数据库连接...${NC}"
if docker ps | grep -q fashion-mysql-simple; then
    echo -e "${GREEN}✓ 数据库容器运行正常${NC}"
else
    echo -e "${RED}✗ 数据库容器未运行${NC}"
    echo "请先启动数据库: ./deployment/db-manager.sh start"
    exit 1
fi
echo ""

# 2. 统计订单总量
echo -e "${YELLOW}[2/7] 统计订单总量...${NC}"
TOTAL_ORDERS=$(run_sql "SELECT COUNT(*) FROM t_production_order WHERE delete_flag=0;" | tail -1)
echo -e "${BLUE}总订单数: $TOTAL_ORDERS${NC}"
echo ""

# 3. 统计缺失字段的订单数量
echo -e "${YELLOW}[3/7] 统计缺失字段...${NC}"
run_sql "SELECT
    COUNT(*) AS '总订单数',
    SUM(CASE WHEN merchandiser IS NULL OR merchandiser = '' THEN 1 ELSE 0 END) AS '缺失跟单员',
    SUM(CASE WHEN company IS NULL OR company = '' THEN 1 ELSE 0 END) AS '缺失公司',
    SUM(CASE WHEN product_category IS NULL OR product_category = '' THEN 1 ELSE 0 END) AS '缺失品类',
    SUM(CASE WHEN pattern_maker IS NULL OR pattern_maker = '' THEN 1 ELSE 0 END) AS '缺失纸样师',
    SUM(CASE WHEN order_details IS NULL OR order_details = '' THEN 1 ELSE 0 END) AS '缺失订单明细',
    SUM(CASE WHEN progress_workflow_json IS NULL OR progress_workflow_json = '' THEN 1 ELSE 0 END) AS '缺失工序流程',
    SUM(CASE WHEN created_by_name IS NULL OR created_by_name = '' THEN 1 ELSE 0 END) AS '缺失创建人'
FROM t_production_order
WHERE delete_flag = 0;"
echo ""

# 4. 显示最近10个订单的数据完整性
echo -e "${YELLOW}[4/7] 最近10个订单数据详情...${NC}"
run_sql "SELECT
    order_no AS '订单号',
    SUBSTRING(style_no, 1, 12) AS '款号',
    CASE WHEN merchandiser IS NULL OR merchandiser = '' THEN '❌' ELSE '✓' END AS '跟单员',
    CASE WHEN company IS NULL OR company = '' THEN '❌' ELSE '✓' END AS '公司',
    CASE WHEN product_category IS NULL OR product_category = '' THEN '❌' ELSE '✓' END AS '品类',
    CASE WHEN pattern_maker IS NULL OR pattern_maker = '' THEN '❌' ELSE '✓' END AS '纸样师',
    CASE WHEN order_details IS NULL OR order_details = '' THEN '❌' ELSE '✓' END AS '明细',
    CASE WHEN progress_workflow_json IS NULL OR progress_workflow_json = '' THEN '❌' ELSE '✓' END AS '工序',
    created_by_name AS '创建人',
    DATE_FORMAT(create_time, '%m-%d %H:%i') AS '创建时间'
FROM t_production_order
WHERE delete_flag = 0
ORDER BY create_time DESC
LIMIT 10;"
echo ""

# 5. 查找问题订单
echo -e "${YELLOW}[5/7] 查找存在问题的订单...${NC}"
PROBLEM_COUNT=$(run_sql "SELECT COUNT(*) FROM t_production_order WHERE delete_flag = 0 AND (
    merchandiser IS NULL OR merchandiser = ''
    OR company IS NULL OR company = ''
    OR product_category IS NULL OR product_category = ''
    OR pattern_maker IS NULL OR pattern_maker = ''
    OR order_details IS NULL OR order_details = ''
    OR progress_workflow_json IS NULL OR progress_workflow_json = ''
);" | tail -1)

if [ "$PROBLEM_COUNT" -gt 0 ]; then
    echo -e "${RED}发现 $PROBLEM_COUNT 个问题订单:${NC}"
    run_sql "SELECT
        order_no AS '订单号',
        SUBSTRING(style_no, 1, 12) AS '款号',
        CONCAT(
            CASE WHEN merchandiser IS NULL OR merchandiser = '' THEN '跟单员 ' ELSE '' END,
            CASE WHEN company IS NULL OR company = '' THEN '公司 ' ELSE '' END,
            CASE WHEN product_category IS NULL OR product_category = '' THEN '品类 ' ELSE '' END,
            CASE WHEN pattern_maker IS NULL OR pattern_maker = '' THEN '纸样师 ' ELSE '' END,
            CASE WHEN order_details IS NULL OR order_details = '' THEN '明细 ' ELSE '' END,
            CASE WHEN progress_workflow_json IS NULL OR progress_workflow_json = '' THEN '工序' ELSE '' END
        ) AS '缺失字段',
        DATE_FORMAT(create_time, '%Y-%m-%d') AS '创建日期'
    FROM t_production_order
    WHERE delete_flag = 0
    AND (
        merchandiser IS NULL OR merchandiser = ''
        OR company IS NULL OR company = ''
        OR product_category IS NULL OR product_category = ''
        OR pattern_maker IS NULL OR pattern_maker = ''
        OR order_details IS NULL OR order_details = ''
        OR progress_workflow_json IS NULL OR progress_workflow_json = ''
    )
    ORDER BY create_time DESC
    LIMIT 10;"
else
    echo -e "${GREEN}✓ 未发现问题订单${NC}"
fi
echo ""

# 6. 检查关联数据完整性（采购需求）
echo -e "${YELLOW}[6/7] 检查采购需求关联数据...${NC}"
run_sql "SELECT
    '采购需求总数' AS '类型',
    COUNT(*) AS '数量',
    SUM(CASE WHEN order_no IS NULL OR order_no = '' THEN 1 ELSE 0 END) AS '缺失订单号',
    SUM(CASE WHEN style_no IS NULL OR style_no = '' THEN 1 ELSE 0 END) AS '缺失款号'
FROM t_material_purchase
WHERE delete_flag = 0
UNION ALL
SELECT
    '扫码记录总数' AS '类型',
    COUNT(*) AS '数量',
    SUM(CASE WHEN order_no IS NULL OR order_no = '' THEN 1 ELSE 0 END) AS '缺失订单号',
    SUM(CASE WHEN style_no IS NULL OR style_no = '' THEN 1 ELSE 0 END) AS '缺失款号'
FROM t_scan_record
WHERE delete_flag = 0;"
echo ""

# 7. 生成报告总结
echo -e "${YELLOW}[7/7] 生成检查报告总结...${NC}"
echo ""
echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}  数据完整性评分${NC}"
echo -e "${BLUE}=====================================${NC}"

# 计算完整性得分
if [ "$TOTAL_ORDERS" -gt 0 ]; then
    MISSING_MERCHANDISER=$(run_sql "SELECT SUM(CASE WHEN merchandiser IS NULL OR merchandiser = '' THEN 1 ELSE 0 END) FROM t_production_order WHERE delete_flag=0;" | tail -1)
    MISSING_COMPANY=$(run_sql "SELECT SUM(CASE WHEN company IS NULL OR company = '' THEN 1 ELSE 0 END) FROM t_production_order WHERE delete_flag=0;" | tail -1)
    MISSING_DETAILS=$(run_sql "SELECT SUM(CASE WHEN order_details IS NULL OR order_details = '' THEN 1 ELSE 0 END) FROM t_production_order WHERE delete_flag=0;" | tail -1)
    MISSING_WORKFLOW=$(run_sql "SELECT SUM(CASE WHEN progress_workflow_json IS NULL OR progress_workflow_json = '' THEN 1 ELSE 0 END) FROM t_production_order WHERE delete_flag=0;" | tail -1)

    MERCHANDISER_RATE=$((100 - MISSING_MERCHANDISER * 100 / TOTAL_ORDERS))
    COMPANY_RATE=$((100 - MISSING_COMPANY * 100 / TOTAL_ORDERS))
    DETAILS_RATE=$((100 - MISSING_DETAILS * 100 / TOTAL_ORDERS))
    WORKFLOW_RATE=$((100 - MISSING_WORKFLOW * 100 / TOTAL_ORDERS))

    AVERAGE_RATE=$(( (MERCHANDISER_RATE + COMPANY_RATE + DETAILS_RATE + WORKFLOW_RATE) / 4 ))

    echo "跟单员完整率: $MERCHANDISER_RATE%"
    echo "公司完整率: $COMPANY_RATE%"
    echo "订单明细完整率: $DETAILS_RATE%"
    echo "工序流程完整率: $WORKFLOW_RATE%"
    echo ""
    echo -e "${BLUE}综合完整率: $AVERAGE_RATE%${NC}"

    if [ "$AVERAGE_RATE" -ge 90 ]; then
        echo -e "${GREEN}评级: 优秀 ★★★★★${NC}"
    elif [ "$AVERAGE_RATE" -ge 70 ]; then
        echo -e "${YELLOW}评级: 良好 ★★★★☆${NC}"
    elif [ "$AVERAGE_RATE" -ge 50 ]; then
        echo -e "${YELLOW}评级: 一般 ★★★☆☆${NC}"
    else
        echo -e "${RED}评级: 较差 ★★☆☆☆${NC}"
    fi
else
    echo "暂无订单数据"
fi

echo ""
echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}  修复建议${NC}"
echo -e "${BLUE}=====================================${NC}"

if [ "$PROBLEM_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}发现 $PROBLEM_COUNT 个问题订单，建议:${NC}"
    echo "1. 运行修复脚本: ./test-order-data-integrity.sh"
    echo "2. 检查前端表单: frontend/src/modules/basic/pages/OrderManagement/index.tsx"
    echo "3. 查看详细分析: 数据完整性问题诊断-2026-02-15.md"
else
    echo -e "${GREEN}✓ 数据完整性良好，无需修复${NC}"
fi

echo ""
echo -e "${BLUE}检查完成！${NC}"
