#!/bin/bash

# 废弃 API 清理脚本
# 版本: 1.0.0
# 日期: 2026-02-03
# 用途: 自动删除标记为 @Deprecated 的 API 端点

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."
BACKEND_DIR="$PROJECT_ROOT/backend"
BACKUP_DIR="$PROJECT_ROOT/backups"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}================================================${NC}"
echo -e "${YELLOW}    废弃 API 清理脚本 v1.0.0${NC}"
echo -e "${YELLOW}================================================${NC}"
echo ""

# 检查 Java 环境
if ! command -v java &> /dev/null; then
    echo -e "${RED}❌ 错误: 未找到 Java 环境${NC}"
    exit 1
fi

echo -e "${GREEN}📋 废弃 API 统计${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 统计废弃方法
DEPRECATED_COUNT=$(find "$BACKEND_DIR/src/main/java" -name "*Controller.java" -exec grep -c "@Deprecated" {} + | awk '{s+=$1} END {print s}')
DEPRECATED_FILES=$(find "$BACKEND_DIR/src/main/java" -name "*Controller.java" -exec grep -l "@Deprecated" {} \; | wc -l | tr -d ' ')

echo "  废弃方法总数: $DEPRECATED_COUNT"
echo "  涉及文件数量: $DEPRECATED_FILES"
echo ""

# 列出详细信息
echo -e "${GREEN}📁 包含废弃方法的文件：${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
find "$BACKEND_DIR/src/main/java" -name "*Controller.java" -exec grep -l "@Deprecated" {} \; | while read file; do
    count=$(grep -c "@Deprecated" "$file")
    filename=$(basename "$file")
    echo "  [$count] $filename"
done
echo ""

# 安全确认
echo -e "${RED}⚠️  警告：此操作将永久删除代码${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  删除前请确保："
echo "  1. ✅ 前端 legacyApiAdapter.ts 已验证正常"
echo "  2. ✅ 所有客户端已更新到新版本"
echo "  3. ✅ 已完成完整的功能测试"
echo "  4. ✅ 已创建数据库备份"
echo "  5. ✅ 已创建代码 Git tag"
echo ""
read -p "❗ 确认删除所有废弃 API？(输入 YES 继续): " confirm

if [ "$confirm" != "YES" ]; then
    echo -e "${YELLOW}❌ 操作已取消${NC}"
    exit 0
fi

# 创建备份
echo ""
echo -e "${GREEN}📦 创建备份...${NC}"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/backend-before-cleanup-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$BACKUP_FILE" -C "$PROJECT_ROOT" backend/
echo -e "${GREEN}✅ 备份完成: $BACKUP_FILE${NC}"

# 创建清理报告
REPORT_FILE="$PROJECT_ROOT/api-cleanup-report-$(date +%Y%m%d-%H%M%S).md"
echo "# 废弃 API 清理报告" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**清理时间**: $(date '+%Y-%m-%d %H:%M:%S')" >> "$REPORT_FILE"
echo "**废弃方法数**: $DEPRECATED_COUNT" >> "$REPORT_FILE"
echo "**涉及文件数**: $DEPRECATED_FILES" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## 清理的文件" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 处理每个文件
echo ""
echo -e "${GREEN}🗑️  开始清理废弃方法...${NC}"
find "$BACKEND_DIR/src/main/java" -name "*Controller.java" -exec grep -l "@Deprecated" {} \; | while read file; do
    filename=$(basename "$file")
    echo -e "  处理: ${YELLOW}$filename${NC}"

    # 记录到报告
    echo "- \`$filename\`" >> "$REPORT_FILE"

    # 这里需要手动处理，因为自动删除方法很复杂
    # 仅标记文件，实际删除需要IDE支持
done

echo ""
echo -e "${YELLOW}⚠️  自动清理脚本限制${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  由于 Java 方法删除的复杂性，本脚本仅执行："
echo "  1. ✅ 创建代码备份"
echo "  2. ✅ 生成清理报告"
echo "  3. ✅ 列出所有废弃方法文件"
echo ""
echo "  📝 请使用 IDE 执行实际删除："
echo "  - IntelliJ IDEA: 右键 → Safe Delete（Ctrl+Alt+Delete）"
echo "  - VS Code: 手动删除标记为 @Deprecated 的方法"
echo ""

# 生成 IDE 清理指南
GUIDE_FILE="$PROJECT_ROOT/IDE-清理指南.md"
cat > "$GUIDE_FILE" << 'EOF'
# IDE 清理废弃 API 指南

## IntelliJ IDEA 清理步骤

1. **全局搜索废弃方法**
   - 快捷键：`Ctrl+Shift+F`（Windows/Linux）或 `Cmd+Shift+F`（Mac）
   - 搜索：`@Deprecated`
   - 范围：`Project Files`

2. **安全删除方法**
   - 右键点击 `@Deprecated` 标记的方法
   - 选择 `Safe Delete`（快捷键：`Alt+Delete`）
   - IDEA 会自动检查引用并提示

3. **批量删除**
   - 使用 `Structural Search`（`Ctrl+Shift+S`）
   - 搜索模板：
     ```java
     @Deprecated
     $Modifier$ $ReturnType$ $MethodName$($Parameters$) {
       $MethodBody$
     }
     ```
   - 右键 → `Delete All Matches`

## VS Code 清理步骤

1. **安装 Java 扩展**
   - Extension Pack for Java

2. **搜索并删除**
   - 全局搜索：`@Deprecated`
   - 文件：`backend/src/main/java/**/*Controller.java`
   - 手动删除标记的方法

3. **验证编译**
   ```bash
   cd backend
   mvn clean compile
   ```

## 删除后验证

1. **编译检查**
   ```bash
   cd backend
   mvn clean install -DskipTests
   ```

2. **运行测试**
   ```bash
   mvn test
   ```

3. **启动服务**
   ```bash
   ./dev-public.sh
   ```

4. **前端功能测试**
   - 打开 http://localhost:5173
   - 测试所有主要功能
   - 检查浏览器 Console 无错误

## 常见问题

**Q: 删除后编译错误？**
A: 检查是否有内部调用，确保废弃方法已被新方法替代

**Q: 前端报错？**
A: 检查 `legacyApiAdapter.ts` 是否正确转发请求

**Q: 如何回滚？**
A: 从备份恢复：`tar -xzf backups/backend-before-cleanup-*.tar.gz`
EOF

echo -e "${GREEN}✅ 清理指南已生成: $GUIDE_FILE${NC}"
echo ""

echo -e "${GREEN}📊 清理报告: $REPORT_FILE${NC}"
echo -e "${GREEN}💾 备份文件: $BACKUP_FILE${NC}"
echo -e "${GREEN}📖 清理指南: $GUIDE_FILE${NC}"
echo ""

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ 准备工作已完成，请参考清理指南手动删除废弃方法${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
