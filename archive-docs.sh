#!/bin/bash
# 文档归档脚本 - 将已完成的文档移动到 docs/archived/ 目录

cd "$(dirname "$0")"

# 创建归档目录
mkdir -p docs/archived/{reports,guides,tests,summaries}

echo "📦 开始归档已完成的文档..."

# 优化报告（已完成）
mv MOBILE_OPTIMIZATION_REPORT.md docs/archived/reports/ 2>/dev/null
mv MOBILE_P0_OPTIMIZATION_TEST.md docs/archived/reports/ 2>/dev/null
mv OPTIMIZATION_REPORT.md docs/archived/reports/ 2>/dev/null
mv FRONTEND_PERFORMANCE_OPTIMIZATION.md docs/archived/reports/ 2>/dev/null
mv FRONTEND_PERFORMANCE_OPTIMIZATION_IMPLEMENTATION.md docs/archived/reports/ 2>/dev/null
mv MOBILE_THEME_TEXT_FIX.md docs/archived/reports/ 2>/dev/null

# 完成报告
mv PC_TABLE_FIELDS_COMPLETION_REPORT.md docs/archived/reports/ 2>/dev/null
mv VALIDATION_COMPLETION_REPORT.md docs/archived/reports/ 2>/dev/null
mv P1_SYNC_COMPLETION_REPORT.md docs/archived/reports/ 2>/dev/null
mv P2_SYNC_COMPLETION_REPORT.md docs/archived/reports/ 2>/dev/null
mv FINAL_PC_FIELDS_SUMMARY.md docs/archived/reports/ 2>/dev/null
mv BACKEND_FIELDS_CHECK_REPORT.md docs/archived/reports/ 2>/dev/null

# 问题修复
mv SECURITY_FIXES.md docs/archived/reports/ 2>/dev/null
mv SYSTEM_ISSUES_AND_FIXES.md docs/archived/reports/ 2>/dev/null
mv REALTIME_SYNC_ERROR_FIX.md docs/archived/reports/ 2>/dev/null
mv VALIDATION_ISSUES_REPORT.md docs/archived/reports/ 2>/dev/null
mv CODE_CLEANUP_REPORT.md docs/archived/reports/ 2>/dev/null

# 实施记录
mv REALTIME_SYNC_IMPLEMENTATION.md docs/archived/reports/ 2>/dev/null
mv ORDER_TRANSFER_IMPLEMENTATION.md docs/archived/reports/ 2>/dev/null
mv DATA_SYNC_OPTIMIZATION.md docs/archived/reports/ 2>/dev/null

# 小程序文档
mv MINIPROGRAM_STYLE_AUDIT.md docs/archived/guides/ 2>/dev/null
mv MINIPROGRAM_ADMIN_STYLE_OPTIMIZATION.md docs/archived/guides/ 2>/dev/null
mv MINIPROGRAM_ADMIN_ASSIGNMENT_GUIDE.md docs/archived/guides/ 2>/dev/null
mv MINIPROGRAM_PERSONAL_CENTER_UPDATE.md docs/archived/guides/ 2>/dev/null
mv MINIPROGRAM_PERMISSION_TEST_GUIDE.md docs/archived/guides/ 2>/dev/null
mv MINIPROGRAM_ROLE_PERMISSION_GUIDE.md docs/archived/guides/ 2>/dev/null

# 测试计划
mv SYSTEM_TEST_EXECUTION_PLAN.md docs/archived/tests/ 2>/dev/null
mv FULL_SYSTEM_TEST_PLAN.md docs/archived/tests/ 2>/dev/null
mv E2E_TEST_PLAN.md docs/archived/tests/ 2>/dev/null

# 工作总结
mv WORK_SUMMARY_20260120.md docs/archived/summaries/ 2>/dev/null
mv WORK_SUMMARY_PC_SYNC.md docs/archived/summaries/ 2>/dev/null
mv SYSTEM_IMPROVEMENT_SUMMARY.md docs/archived/summaries/ 2>/dev/null

# 其他规范
mv FONT_SPECIFICATION.md docs/archived/guides/ 2>/dev/null
mv SYSTEM_MAINTENANCE_ASSESSMENT.md docs/archived/reports/ 2>/dev/null
mv danjia.md docs/archived/ 2>/dev/null
mv kaifa.md docs/archived/ 2>/dev/null

echo "✅ 归档完成！"
echo ""
echo "📊 归档统计："
echo "  - reports/  : $(ls -1 docs/archived/reports/ 2>/dev/null | wc -l | tr -d ' ') 个文件"
echo "  - guides/   : $(ls -1 docs/archived/guides/ 2>/dev/null | wc -l | tr -d ' ') 个文件"
echo "  - tests/    : $(ls -1 docs/archived/tests/ 2>/dev/null | wc -l | tr -d ' ') 个文件"
echo "  - summaries/: $(ls -1 docs/archived/summaries/ 2>/dev/null | wc -l | tr -d ' ') 个文件"
echo ""
echo "📁 当前目录剩余 MD 文件："
ls -1 *.md 2>/dev/null | wc -l
echo ""
echo "💡 提示：归档的文件保留在 docs/archived/ 目录中，可随时查看"
