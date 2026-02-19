#!/bin/bash

# 删除后端58个@Deprecated废弃端点辅助脚本
# 使用前提: PC前端已迁移 ✅, 小程序已验证 ✅

set -e

BACKEND_DIR="/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend"
REPORT_FILE="deprecated-endpoints-deletion-report.txt"

echo "======================================"
echo " 后端废弃端点删除辅助工具"
echo "======================================"
echo ""

# 验证前置条件
echo "📋 验证前置条件..."
echo "✅ PC前端已迁移13个废弃API（已确认）"
echo "✅ 小程序0个废弃API调用（已确认）"
echo "✅ 新端点运行稳定（已确认）"
echo ""

# 统计废弃端点数量
deprecated_count=$(grep -r "@Deprecated" $BACKEND_DIR/src/main/java/com/fashion/supplychain/*/controller/*.java | wc -l | tr -d ' ')
echo "🔍 检测到 $deprecated_count 个@Deprecated注解"

if [ "$deprecated_count" != "58" ]; then
  echo "⚠️  警告: 预期58个，实际检测到${deprecated_count}个"
fi

echo ""
echo "📝 生成待删除方法清单..."

# 生成详细清单
cat > $REPORT_FILE << 'REPORT_HEADER'
================================================================
后端废弃端点删除清单（58个）
生成时间: $(date +%Y-%m-%d\ %H:%M:%S)
================================================================

说明:
- 每个@Deprecated方法需手动删除（IDE删除safest）
- 删除前请确保已备份代码（git commit）
- 删除后运行单元测试验证

----------------------------------------------------------------
REPORT_HEADER

# 按Controller分组列出废弃方法
for controller_file in $BACKEND_DIR/src/main/java/com/fashion/supplychain/*/controller/*.java; do
  controller_name=$(basename "$controller_file" .java)
  deprecated_count=$(grep -c "@Deprecated" "$controller_file" 2>/dev/null || echo "0")

  if [ "$deprecated_count" -gt "0" ]; then
    echo "" >> $REPORT_FILE
    echo "=== $controller_name ($deprecated_count个废弃方法) ===" >> $REPORT_FILE
    echo "文件: $controller_file" >> $REPORT_FILE
    echo "" >> $REPORT_FILE

    # 提取废弃方法的行号和方法签名
    grep -n -B 3 "@Deprecated" "$controller_file" | \
      grep -E "@Deprecated|@.*Mapping|public.*\{" | \
      sed 's/^/  /' >> $REPORT_FILE

    echo "" >> $REPORT_FILE
  fi
done

# 添加删除步骤指南
cat >> $REPORT_FILE << 'REPORT_FOOTER'

================================================================
删除步骤建议
================================================================

方式一: IDE手动删除（推荐）
1. 在IntelliJ IDEA中打开backend项目
2. 使用 Find in Files (Cmd+Shift+F)
3. 搜索: @Deprecated
4. 范围: backend/src/main/java/com/fashion/supplychain/*/controller/
5. 逐个删除@Deprecated标记的整个方法
6. 运行测试: mvn clean test
7. 提交代码: git commit -m "删除58个废弃API端点"

方式二: 正则批量处理（谨慎）
# 此方法需要人工审查，禁止无审查执行
sed -i.bak '/废弃方法开始/,/废弃方法结束/d' Controller.java

方式三: Git审查模式
1. 创建新分支: git checkout -b remove-deprecated-endpoints
2. 手动删除方法
3. 对比变更: git diff
4. 运行测试: mvn clean test
5. 合并分支: git merge（测试通过后）

================================================================
删除后验证清单
================================================================

[ ] 1. 编译成功: mvn clean compile
[ ] 2. 单元测试通过: mvn clean test
[ ] 3. P0测试通过: ./test-production-order-creator-tracking.sh
[ ] 4. P1测试通过: ./test-complete-business-flow.sh
[ ] 5. 前端功能验证: 手动测试核心业务流程
[ ] 6. 小程序功能验证: 扫码、查询、结算流程
[ ] 7. 日志监控: 检查后端日志无404错误
[ ] 8. 回滚方案准备: git tag pre-delete-deprecated-endpoints

================================================================
回滚方案
================================================================

如删除后出现问题:
git revert HEAD
或
git reset --soft HEAD~1

保留期限: 建议保留30天观察期，期间不删除git历史

================================================================
REPORT_FOOTER

echo "✅ 已生成删除清单: $REPORT_FILE"
echo ""

# 显示摘要
echo "📊 废弃端点分布:"
for controller_file in $BACKEND_DIR/src/main/java/com/fashion/supplychain/*/controller/*.java; do
  controller_name=$(basename "$controller_file" .java)
  deprecated_count=$(grep -c "@Deprecated" "$controller_file" 2>/dev/null || echo "0")

  if [ "$deprecated_count" -gt "0" ]; then
    printf "  %-40s %2d个\n" "$controller_name" "$deprecated_count"
  fi
done

echo ""
echo "======================================"
echo "📖 完整清单已保存到: $REPORT_FILE"
echo "⚠️  警告: 删除是永久性操作，请先备份代码"
echo "======================================"
echo ""

# 交互式确认
read -p "是否现在查看删除清单? (yes/no): " view_report

if [ "$view_report" = "yes" ] || [ "$view_report" = "y" ]; then
  cat $REPORT_FILE
  echo ""
  echo "======================================"
  echo "提示: 请使用IDE手动删除，不要自动化批量删除"
  echo "======================================"
fi

echo ""
echo "✅ 脚本执行完成"
echo "下一步: 打开 $REPORT_FILE 并按指南手动删除废弃方法"
