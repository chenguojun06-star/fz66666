#!/bin/bash

##########################################
# 全面修复单价维护 - Phase 2
# 处理：price -> unitPrice 转换
#       空模板跳过
#       工序名称智能匹配
##########################################

DB_HOST="127.0.0.1"
DB_PORT="3308"
DB_USER="root"
DB_PASS="changeme"
DB_NAME="fashion_supplychain"

echo "========================================="
echo "   单价维护 Phase 2 修复"
echo "   处理 price -> unitPrice 转换"
echo "========================================="

# 1. 转换 price 字段为 unitPrice
echo "1️⃣  转换 price 字段为 unitPrice..."
mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME <<'SQL' 2>&1 | grep -v "Warning"
UPDATE t_template_library
SET template_content = REPLACE(template_content, '"price":', '"unitPrice":')
WHERE template_type = 'process'
AND template_content LIKE '%"price":%'
AND template_content NOT LIKE '%"unitPrice":%';

SELECT ROW_COUNT() as '已转换记录数';
SQL

echo ""

# 2. 为常见工序名称补充默认单价
echo "2️⃣  为常见工序补充默认单价..."
mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME <<'SQL' 2>&1 | grep -v "Warning"
-- 上领、上袖等针织工艺（精细工序，8.0元）
UPDATE t_template_library
SET template_content = REPLACE(
    REPLACE(
        REPLACE(
            REPLACE(template_content,
                '"processName":"上领"',
                '"processName":"上领","unitPrice":8.0'
            ),
            '"processName":"上袖"',
            '"processName":"上袖","unitPrice":8.0'
        ),
        '"processName":"压肩"',
        '"processName":"压肩","unitPrice":7.0'
    ),
    '"processName":"整件"',
    '"processName":"整件","unitPrice":16.0'
)
WHERE template_type = 'process'
AND template_content NOT LIKE '%unitPrice%';

SELECT ROW_COUNT() as '已补充记录数';
SQL

echo ""

# 3. 为剩余工序设置默认单价3.0
echo "3️⃣  为剩余工序设置默认单价 3.0 元..."
mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME <<'SQL' 2>&1 | grep -v "Warning"
UPDATE t_template_library
SET template_content = REPLACE(
    template_content,
    '"machineType":',
    '"unitPrice":3.0,"machineType":'
)
WHERE template_type = 'process'
AND template_content LIKE '%"machineType":%'
AND template_content NOT LIKE '%unitPrice%'
AND template_content != '{"steps":[]}';  -- 跳过空模板

SELECT ROW_COUNT() as '已设置默认单价记录数';
SQL

echo ""

# 4. 统计结果
echo "4️⃣  修复结果统计..."
mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME <<'SQL' 2>&1 | grep -v "Warning"
SELECT
    '工序模板总数' as 指标,
    COUNT(*) as 数量
FROM t_template_library
WHERE template_type = 'process'
UNION ALL
SELECT
    '已有单价模板',
    COUNT(*)
FROM t_template_library
WHERE template_type = 'process'
AND template_content LIKE '%unitPrice%'
UNION ALL
SELECT
    '空模板（需手动创建）',
    COUNT(*)
FROM t_template_library
WHERE template_type = 'process'
AND template_content = '{"steps":[]}'
UNION ALL
SELECT
    '仍缺单价模板',
    COUNT(*)
FROM t_template_library
WHERE template_type = 'process'
AND template_content NOT LIKE '%unitPrice%'
AND template_content != '{"steps":[]}';
SQL

echo ""

# 5. 显示需要手动检查的模板
echo "5️⃣  需要手动检查的模板（前5条）..."
mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME <<'SQL' 2>&1 | grep -v "Warning"
SELECT
    template_name,
    CASE
        WHEN template_content = '{"steps":[]}' THEN '空模板（需手动创建内容）'
        WHEN template_content NOT LIKE '%unitPrice%' THEN '缺少单价字段'
        ELSE '正常'
    END as 状态
FROM t_template_library
WHERE template_type = 'process'
AND (
    template_content = '{"steps":[]}'
    OR template_content NOT LIKE '%unitPrice%'
)
LIMIT 5;
SQL

echo ""
echo "========================================="
echo "✅ Phase 2 修复完成！"
echo ""
echo "📋 后续操作："
echo "   1. 刷新前端页面测试【基础资料】→【单价维护】"
echo "   2. 空模板需要手动编辑添加工序"
echo "   3. 如需调整单价，在前端页面直接编辑"
echo "========================================="
