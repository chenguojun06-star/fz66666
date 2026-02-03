#!/bin/bash
# 检查全站分页器配置统一性
# 标准格式：showTotal + showSizeChanger + pageSizeOptions: ['10', '20', '50', '100']

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend/src"

echo "=========================================="
echo "全站分页器配置统一性检查"
echo "=========================================="
echo ""

# 标准配置
echo "✅ 标准分页配置格式："
echo "  - showTotal: (total) => \`共 \${total} 条\`"
echo "  - showSizeChanger: true"
echo "  - pageSizeOptions: ['10', '20', '50', '100']"
echo ""

# 1. 找出所有包含 pagination={{ 的文件
echo "步骤 1: 扫描所有分页配置..."
PAGINATION_FILES=$(grep -r "pagination={{" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" -l | sort | uniq)

TOTAL_FILES=$(echo "$PAGINATION_FILES" | wc -l | xargs)
echo "找到 $TOTAL_FILES 个包含分页配置的文件"
echo ""

# 2. 检查缺少 showTotal 的文件
echo "步骤 2: 检查缺少 showTotal 的文件..."
MISSING_SHOWTOTAL=0

for file in $PAGINATION_FILES; do
    REL_PATH=${file#$ROOT_DIR/}

    # 检查文件中是否有 pagination 但没有 showTotal
    if grep -q "pagination={{" "$file"; then
        if ! grep -q "showTotal" "$file"; then
            echo "  ❌ $REL_PATH"
            ((MISSING_SHOWTOTAL++))
        fi
    fi
done

echo "缺少 showTotal: $MISSING_SHOWTOTAL 个文件"
echo ""

# 3. 检查缺少 showSizeChanger 的文件
echo "步骤 3: 检查缺少 showSizeChanger 的文件..."
MISSING_SIZECHANGER=0

for file in $PAGINATION_FILES; do
    REL_PATH=${file#$ROOT_DIR/}

    if grep -q "pagination={{" "$file"; then
        if ! grep -q "showSizeChanger" "$file"; then
            echo "  ❌ $REL_PATH"
            ((MISSING_SIZECHANGER++))
        fi
    fi
done

echo "缺少 showSizeChanger: $MISSING_SIZECHANGER 个文件"
echo ""

# 4. 检查缺少 pageSizeOptions 的文件
echo "步骤 4: 检查缺少 pageSizeOptions 的文件..."
MISSING_SIZEOPTIONS=0

for file in $PAGINATION_FILES; do
    REL_PATH=${file#$ROOT_DIR/}

    if grep -q "pagination={{" "$file"; then
        if ! grep -q "pageSizeOptions" "$file"; then
            echo "  ❌ $REL_PATH"
            ((MISSING_SIZEOPTIONS++))
        fi
    fi
done

echo "缺少 pageSizeOptions: $MISSING_SIZEOPTIONS 个文件"
echo ""

# 5. 检查 showTotal 格式不一致的
echo "步骤 5: 检查 showTotal 文本不一致..."
echo "标准格式: \`共 \${total} 条\` 或 \`共 \${t} 条\`"
echo ""

grep -r "showTotal.*共.*条" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" -n | while read -r line; do
    if echo "$line" | grep -q "条记录"; then
        FILE_PATH=$(echo "$line" | cut -d: -f1)
        REL_PATH=${FILE_PATH#$ROOT_DIR/}
        LINE_NUM=$(echo "$line" | cut -d: -f2)
        echo "  ⚠️  $REL_PATH:$LINE_NUM - 使用了 '条记录' 而非 '条'"
    fi
done

echo ""

# 6. 统计总结
echo "=========================================="
echo "统计总结"
echo "=========================================="
echo "包含分页配置的文件: $TOTAL_FILES 个"
echo "缺少 showTotal: $MISSING_SHOWTOTAL 个"
echo "缺少 showSizeChanger: $MISSING_SIZECHANGER 个"
echo "缺少 pageSizeOptions: $MISSING_SIZEOPTIONS 个"
echo ""

# 计算完全符合标准的文件数
FULLY_COMPLIANT=$((TOTAL_FILES - MISSING_SHOWTOTAL))
FULLY_COMPLIANT=$((FULLY_COMPLIANT > 0 ? FULLY_COMPLIANT : 0))

echo "完全符合标准 (有 showTotal): 约 $FULLY_COMPLIANT 个"
echo "需要优化: 约 $MISSING_SHOWTOTAL 个"
echo ""

# 7. 列出主要需要修复的文件
echo "=========================================="
echo "主要需要修复的文件 (缺少完整配置)"
echo "=========================================="

for file in $PAGINATION_FILES; do
    REL_PATH=${file#$ROOT_DIR/}
    ISSUES=""

    if grep -q "pagination={{" "$file"; then
        # 检查三个关键配置
        HAS_SHOWTOTAL=false
        HAS_SIZECHANGER=false
        HAS_SIZEOPTIONS=false

        grep -q "showTotal" "$file" && HAS_SHOWTOTAL=true
        grep -q "showSizeChanger" "$file" && HAS_SIZECHANGER=true
        grep -q "pageSizeOptions" "$file" && HAS_SIZEOPTIONS=true

        # 如果缺少任何一个，列出来
        if [ "$HAS_SHOWTOTAL" = false ] || [ "$HAS_SIZECHANGER" = false ] || [ "$HAS_SIZEOPTIONS" = false ]; then
            MISSING_ITEMS=""
            [ "$HAS_SHOWTOTAL" = false ] && MISSING_ITEMS="${MISSING_ITEMS}showTotal "
            [ "$HAS_SIZECHANGER" = false ] && MISSING_ITEMS="${MISSING_ITEMS}showSizeChanger "
            [ "$HAS_SIZEOPTIONS" = false ] && MISSING_ITEMS="${MISSING_ITEMS}pageSizeOptions "

            echo "  ❌ $REL_PATH"
            echo "     缺少: $MISSING_ITEMS"
        fi
    fi
done

echo ""
echo "✅ 检查完成"
