#!/bin/bash

# ========================================
# 修复验证报告
# 日期: 2026-02-06
# ========================================

echo "======================================"
echo "修复验证报告"
echo "======================================"
echo

echo "【修复1】入库验证规则放宽"
echo "----------------------------------------"
echo "原规则: 每次入库5%~15%（对于200件=10~30件）"
echo "新规则: 每次入库5%~50%（对于200件=10~100件）"
echo "修改文件: ProductWarehousingServiceImpl.java"
echo "- WAREHOUSING_BATCH_MAX_RATIO: 0.15 → 0.50"
echo "- 错误提示已更新: '5%~15%' → '5%~50%'"
echo "✅ 修改完成"
echo

echo "【修复2】裁剪任务列表过滤已关闭订单"
echo "----------------------------------------"
echo "修改文件: CuttingTaskOrchestrator.java"
echo "修改方法: getMyTasks()"
echo "新增逻辑:"
echo "  1. 查询用户的裁剪任务（status=received）"
echo "  2. 提取所有订单ID"
echo "  3. 过滤有效订单（排除closed/completed/cancelled/archived）"
echo "  4. 只返回有效订单的任务"
echo "✅ 修改完成，已添加Set和Collectors导入"
echo

echo "【修复3】采购任务列表过滤已关闭订单"
echo "----------------------------------------"
echo "修改文件: MaterialPurchaseOrchestrator.java"
echo "修改方法: getMyTasks()"
echo "新增逻辑:"
echo "  1. 查询用户的采购任务（status=received）"
echo "  2. 提取所有订单ID"
echo "  3. 过滤有效订单（排除closed/completed/cancelled/archived）"
echo "  4. 只返回有效订单的任务"
echo "✅ 修改完成，已添加Set导入"
echo

echo "【修复4】质检任务列表过滤已关闭订单"
echo "----------------------------------------"
echo "修改文件: ScanRecordOrchestrator.java"
echo "修改方法: getMyQualityTasks()"
echo "新增逻辑:"
echo "  0. ⭐ 首先检查订单是否已关闭/完成（新增）"
echo "  1. 检查是否已有质检确认记录"
echo "  2. 检查该菲号是否已入库"
echo "  3. 未确认且未入库的添加到待处理列表"
echo "✅ 修改完成"
echo

echo "======================================"
echo "修改汇总"
echo "======================================"
echo "修改文件数量: 4个"
echo "修改方法数量: 4个"
echo "新增import: Set, Collectors（2个文件）"
echo "后端状态: 已重启并运行"
echo

echo "======================================"
echo "预期效果"
echo "======================================"
echo "1. 入库操作："
echo "   - ❌ 旧行为：50件/200件（25%）被拒绝"
echo "   - ✅ 新行为：50件/200件（25%）允许通过"
echo

echo "2. 小程序待处理任务："
echo "   - ❌ 旧行为：显示已关闭订单的任务"
echo "   - ✅ 新行为：只显示生产中订单的任务"
echo

echo "3. 系统一致性："
echo "   - ✅ 所有统计（生产订单、延期订单）已统一排除已关闭订单"
echo "   - ✅ 所有任务列表（裁剪、采购、质检）已统一排除已关闭订单"
echo

echo "======================================"
echo "需要用户验证"
echo "======================================"
echo "1. 打开小程序，查看'待处理任务'是否还有已关闭订单"
echo "2. 尝试入库50件（菲号200件），是否能成功提交"
echo "3. 确认仪表板统计数据是否排除已关闭订单"
echo

echo "======================================"
echo "代码变更详情"
echo "======================================"

echo
echo "【变更1】ProductWarehousingServiceImpl.java"
echo "行号: 44-45"
echo "变更前:"
echo "  WAREHOUSING_BATCH_MAX_RATIO = new BigDecimal(\"0.15\");"
echo "变更后:"
echo "  WAREHOUSING_BATCH_MAX_RATIO = new BigDecimal(\"0.50\");"
echo

echo "【变更2】CuttingTaskOrchestrator.java"
echo "方法: getMyTasks()"
echo "新增代码（关键部分）:"
cat << 'EOF'
  // 过滤掉已关闭/已完成订单对应的任务
  Set<String> orderIds = tasks.stream()
          .map(CuttingTask::getProductionOrderId)
          .filter(StringUtils::hasText)
          .collect(Collectors.toSet());

  Set<String> validOrderIds = productionOrderService.lambdaQuery()
          .in(ProductionOrder::getId, orderIds)
          .eq(ProductionOrder::getDeleteFlag, 0)
          .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived")
          .list()
          .stream()
          .map(ProductionOrder::getId)
          .collect(Collectors.toSet());

  return tasks.stream()
          .filter(task -> validOrderIds.contains(task.getProductionOrderId()))
          .collect(Collectors.toList());
EOF
echo

echo "【变更3】MaterialPurchaseOrchestrator.java"
echo "方法: getMyTasks()"
echo "新增代码（关键部分）:"
cat << 'EOF'
  // 过滤掉已关闭/已完成订单对应的采购任务
  Set<String> orderIds = myPurchases.stream()
          .map(MaterialPurchase::getOrderId)
          .filter(StringUtils::hasText)
          .collect(Collectors.toSet());

  Set<String> validOrderIds = productionOrderService.lambdaQuery()
          .in(ProductionOrder::getId, orderIds)
          .eq(ProductionOrder::getDeleteFlag, 0)
          .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived")
          .list()
          .stream()
          .map(ProductionOrder::getId)
          .collect(Collectors.toSet());

  return myPurchases.stream()
          .filter(purchase -> validOrderIds.contains(purchase.getOrderId()))
          .collect(Collectors.toList());
EOF
echo

echo "【变更4】ScanRecordOrchestrator.java"
echo "方法: getMyQualityTasks()"
echo "新增代码（在循环开始处）:"
cat << 'EOF'
  // 0. 检查订单是否已关闭/完成（排除已关闭/已完成/已取消/已归档订单）
  if (hasText(orderId)) {
      ProductionOrder order = productionOrderService.getById(orderId);
      if (order == null || order.getDeleteFlag() == 1) {
          continue; // 订单不存在或已删除，跳过
      }
      String orderStatus = order.getStatus();
      if ("closed".equals(orderStatus) || "completed".equals(orderStatus) 
              || "cancelled".equals(orderStatus) || "archived".equals(orderStatus)) {
          continue; // 订单已关闭/完成，跳过
      }
  }
EOF
echo

echo "======================================"
echo "完成！"
echo "======================================"
