#!/bin/bash

# 文档清理脚本 - 2026-02-01
# 目标：只保留核心文档，删除已完成的报告和分析文档

cd /Users/guojunmini4/Documents/服装66666

# 创建归档目录
mkdir -p archive/2026-02-01-文档清理

echo "📋 开始文档清理..."

# ============ 要保留的核心文档 ============
KEEP_FILES=(
    "开发指南.md"
    "系统状态.md"
    "快速测试指南.md"
    "INVENTORY_SYSTEM_GUIDE.md"
    "README.md"
    "业务流程说明.md"
    "设计系统完整规范-2026.md"
    "系统上线前验证清单.md"
)

echo ""
echo "✅ 保留的核心文档 (${#KEEP_FILES[@]}份):"
for file in "${KEEP_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    fi
done

# ============ 要删除的文档 ============
DELETE_FILES=(
    # API优化相关（已完成）
    "API优化实施进度报告-2026-02-01.md"
    "API优化工作总结-2026-02-01.md"
    "API接口详细统计报告-20#!/bin/bash

# 文档清理脚本 - 2026-02-01
# 目标：只保留核?A
# 文档??# 目标：只保留核心文档-A
cd /Users/guojunmini4/Documents/服装66666

# 创建归档目录
mkdir    
# 创建归档目录
mkdir -p archive/202
  mkdir -p archive/20?echo "📋 开始文档清理..."

# =??# ============ 要保留的核?  KEEP_FILES=(
    "开发指南.md"
    "系统状?     "开发??   "系统状态.md?   "快速测试指d"    "INVENTORY_SYSTEM_GUID??   "README.md"
    "业务流      "业务流??   "设计系统完整规02    "系统上线前验证清单.md"
??

echo ""
echo "✅ 保留的核????cho "?.for file in "${KEEP_FILES[@]}"; do
    if [ -f "$file" 2-    if [ -f "$file" ]; then
     ?       echo "  ✓ $file"?   fi
done

# ==========
 done
??
# 技DELETE_FILES=(
    # API优化相关（已完?
    # API优?    "API优化实施进度报告-20-0    "API优化工作总结-2026-02-01.md"
    ??    "API接口详细统计报告-20#!/bi?# 文档清理脚本 - 2026-02-01
# 目标?  # 目标：只保留核?A
# 文? 文档??# 目标：??cd /Users/guojunmini4/Documents/服装66666

??
# 创建归档目录
mkdir    
# 创建?fomkdir    
# 创建?F# 创建";mkdir -p archive/20il  mkdir -p archive/ec
# =??# ============ 要保留的核?  KEEP_FILES=(
 d -    "开发指南.md"
    "系统状?     "开发?o
    "系统状?   Yy    "业务流      "业务流??   "设计系统完整规02    "系统上线前验证清单.md"
??

echo ""
echo "?H??

echo ""
echo "✅ 保留的核????cho "?.for file in "${KEEP_FILES[@]}"; do
 mv "$file" 
erchecho "26    if [ -f "$file" 2-    if [ -f "$file" ]; then
     ?       echo AR     ?       echo "  ✓ $file"?   fi
done

?one

# ==========
 done
??
# 技DELETE_{#
# P_F done
??
# "
??
# "# -    # API优化相RC    # API优?    "API优化??    ??    "API接口详细统计报告-20#!/bi?# 文档清理脚本 - 2026-02-01
# 目标?
ls -1 *.md 2>/dev/null | wc -l
