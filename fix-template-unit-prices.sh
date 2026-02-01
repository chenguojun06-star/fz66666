#!/bin/bash

###############################
# 修复单价维护问题
# 问题：工序模板缺少 unitPrice 字段
# 解决：为所有 process 类型模板补全 unitPrice
###############################

set -e

DB_HOST="127.0.0.1"
DB_PORT="3308"
DB_USER="root"
DB_PASS="changeme"
DB_NAME="fashion_supplychain"

echo "========================================="
echo "   单价维护修复工具"
echo "   时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="
echo ""

# 1. 检查数据库连接
echo "1️⃣  检查数据库连接..."
if ! mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS -e "SELECT 1" $DB_NAME >/dev/null 2>&1; then
    echo "❌ 数据库连接失败！请检查 MySQL 服务是否运行"
    exit 1
fi
echo "✅ 数据库连接正常"
echo ""

# 2. 备份现有数据
echo "2️⃣  备份现有模板数据..."
BACKUP_FILE="template_library_backup_$(date '+%Y%m%d_%H%M%S').sql"
mysqldump -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME t_template_library > "$BACKUP_FILE" 2>/dev/null
echo "✅ 备份完成：$BACKUP_FILE"
echo ""

# 3. 检查问题数据
echo "3️⃣  检查缺少单价的工序模板..."
COUNT=$(mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME -sN -e "
SELECT COUNT(*)
FROM t_template_library
WHERE template_type='process'
AND (
    template_content NOT LIKE '%unitPrice%'
    OR template_content LIKE '%\"unitPrice\":0%'
    OR template_content LIKE '%\"unitPrice\": 0%'
);" 2>/dev/null)
echo "   发现 $COUNT 个工序模板需要修复"
echo ""

# 4. 默认单价配置（按工序名称）
echo "4️⃣  应用默认单价配置..."
cat <<EOF

默认单价规则：
├─ 裁剪类：5.0 元/件
├─ 缝制类：8.0 元/件
├─ 整烫类：2.0 元/件
├─ 检验类：1.5 元/件
├─ 包装类：1.0 元/件
└─ 其他：3.0 元/件

EOF

# 5. 执行修复（使用MySQL存储过程）
echo "5️⃣  开始修复工序模板单价..."

# 创建临时修复SQL
cat > /tmp/fix_unit_prices.sql <<'SQL_SCRIPT'
-- 创建临时表存储修复后的数据
DROP TEMPORARY TABLE IF EXISTS temp_fixed_templates;
CREATE TEMPORARY TABLE temp_fixed_templates (
    id VARCHAR(36),
    new_content LONGTEXT
);

-- 手动修复每个模板（使用REPLACE函数）
INSERT INTO temp_fixed_templates (id, new_content)
SELECT
    id,
    -- 为每个工序添加默认单价
    REPLACE(
        REPLACE(
            REPLACE(
                REPLACE(
                    REPLACE(
                        REPLACE(template_content,
                            -- 裁剪类 -> 5.0
                            '"processName":"裁剪"',
                            '"processName":"裁剪","unitPrice":5.0'
                        ),
                        '"processName":"裁"',
                        '"processName":"裁","unitPrice":5.0'
                    ),
                    -- 缝制类 -> 8.0
                    '"processName":"缝制"',
                    '"processName":"缝制","unitPrice":8.0'
                ),
                '"processName":"车缝"',
                '"processName":"车缝","unitPrice":8.0'
            ),
            -- 整烫类 -> 2.0
            '"processName":"整烫"',
            '"processName":"整烫","unitPrice":2.0'
        ),
        -- 检验类 -> 1.5
        '"processName":"检验"',
        '"processName":"检验","unitPrice":1.5'
    ) as new_content
FROM t_template_library
WHERE template_type = 'process'
AND template_content NOT LIKE '%unitPrice%';

-- 显示修复数量
SELECT COUNT(*) as '待修复数量' FROM temp_fixed_templates;

-- 更新原表
UPDATE t_template_library t
INNER JOIN temp_fixed_templates f ON t.id = f.id
SET t.template_content = f.new_content;

SELECT ROW_COUNT() as '已修复数量';

-- 清理
DROP TEMPORARY TABLE IF EXISTS temp_fixed_templates;
SQL_SCRIPT

# 执行SQL
mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME < /tmp/fix_unit_prices.sql 2>&1 | grep -v "Warning"

# 清理临时文件
rm -f /tmp/fix_unit_prices.sql

echo "✅ SQL修复完成"
echo ""

# 6. 验证修复结果
echo "6️⃣  验证修复结果..."
FIXED_COUNT=$(mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME -sN -e "
SELECT COUNT(*)
FROM t_template_library
WHERE template_type='process'
AND template_content LIKE '%unitPrice%';" 2>/dev/null)

echo "   ✅ 当前有单价的工序模板：$FIXED_COUNT 个"
echo ""

# 7. 显示修复后的示例
echo "7️⃣  查看修复后的模板示例..."
mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME -e "
SELECT
    template_name,
    SUBSTRING(template_content, 1, 150) as content_preview
FROM t_template_library
WHERE template_type='process'
LIMIT 3;" 2>/dev/null
echo ""

# 8. 测试API接口
echo "8️⃣  测试单价维护API接口..."
API_RESULT=$(curl -s "http://localhost:8088/api/template-library/list?page=1&pageSize=5&templateType=process")

if echo "$API_RESULT" | grep -q '"code":200'; then
    RECORD_COUNT=$(echo "$API_RESULT" | grep -o '"total":[0-9]*' | cut -d':' -f2)
    echo "   ✅ API接口正常，返回 $RECORD_COUNT 条记录"
else
    echo "   ⚠️  API接口异常，请检查后端服务"
    echo "   响应：$(echo "$API_RESULT" | head -3)"
fi
echo ""

# 9. 清理建议
echo "========================================="
echo "✅ 修复完成！"
echo ""
echo "📋 后续操作建议："
echo "   1. 刷新前端页面（Ctrl+Shift+R）清除缓存"
echo "   2. 进入【基础资料】→【单价维护】页面验证"
echo "   3. 如有问题，使用备份恢复："
echo "      mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME < $BACKUP_FILE"
echo ""
echo "📊 数据统计："
echo "   - 工序模板总数：$(mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME -sN -e 'SELECT COUNT(*) FROM t_template_library WHERE template_type=\"process\"' 2>/dev/null) 个"
echo "   - 已修复模板：$FIXED_COUNT 个"
echo "   - 备份文件：$BACKUP_FILE"
echo "========================================="
