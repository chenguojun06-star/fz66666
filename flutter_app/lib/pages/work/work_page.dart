import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import 'work_controller.dart';

class WorkPage extends GetView<WorkController> {
  const WorkPage({super.key});

  @override
  Widget build(BuildContext context) {
    Get.put(WorkController());
    return Scaffold(
      backgroundColor: AppColors.bgPage,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
              child: TextField(
                onChanged: controller.doSearch,
                decoration: InputDecoration(
                  hintText: '搜索订单号/款号',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: Obx(() => controller.hasSearched.value
                      ? IconButton(icon: const Icon(Icons.close, size: 18), onPressed: controller.clearSearch)
                      : const SizedBox.shrink()),
                  filled: true,
                  fillColor: AppColors.bgCard,
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(vertical: 8),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.border)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.border)),
                ),
              ),
            ),
            Obx(() => _buildTabBar()),
            Expanded(
              child: Obx(() => _buildOrderList()),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      height: 44,
      margin: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.bgGray,
        borderRadius: BorderRadius.circular(AppSpacing.md),
      ),
      child: Row(
        children: controller.tabs.map((tab) {
          final isActive = controller.activeTab.value == tab['key'];
          return Expanded(
            child: GestureDetector(
              onTap: () => controller.onTab(tab['key'] as String),
              child: Container(
                decoration: BoxDecoration(
                  color: isActive ? AppColors.bgCard : Colors.transparent,
                  borderRadius: BorderRadius.circular(AppSpacing.md),
                  boxShadow: isActive ? [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 2)] : [],
                ),
                alignment: Alignment.center,
                child: Text(tab['label'] as String,
                  style: TextStyle(fontSize: 14, fontWeight: isActive ? FontWeight.w600 : FontWeight.normal, color: isActive ? AppColors.primary : AppColors.textSecondary)),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildOrderList() {
    if (controller.loading.value && controller.orders.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (controller.orders.isEmpty) {
      return const Center(child: Text('暂无数据', style: TextStyle(color: AppColors.textTertiary)));
    }
    return RefreshIndicator(
      onRefresh: () => controller.loadOrders(reset: true),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
        itemCount: controller.orders.length + 1,
        itemBuilder: (_, i) {
          if (i == controller.orders.length) {
            return Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Obx(() => Text(
                controller.hasMore.value ? '加载更多' : '没有更多了',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 13, color: AppColors.textTertiary),
              )),
            );
          }
          return _buildOrderCard(controller.orders[i]);
        },
      ),
    );
  }

  Widget _buildOrderCard(Map<String, dynamic> order) {
    final progress = (order['productionProgress'] ?? 0) as num;
    final orderNo = order['orderNo']?.toString() ?? '-';
    final styleNo = order['styleNo']?.toString() ?? '-';
    final processName = order['currentProcessName']?.toString() ?? '';
    final factoryName = order['factoryName']?.toString() ?? '-';

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(AppSpacing.lg),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(orderNo, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              ),
              if (processName.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: processName == '裁剪' ? AppColors.tagBgOrange : AppColors.tagBgGreen,
                    borderRadius: BorderRadius.circular(AppSpacing.sm),
                  ),
                  child: Text(processName, style: TextStyle(fontSize: 11, color: processName == '裁剪' ? AppColors.warning : AppColors.success)),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text('$styleNo · $factoryName', style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(AppSpacing.lg),
                  child: LinearProgressIndicator(
                    value: progress.toDouble() / 100,
                    backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                    valueColor: const AlwaysStoppedAnimation<Color>(AppColors.primary),
                    minHeight: 6,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text('${progress.toInt()}%', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            ],
          ),
        ],
      ),
    );
  }
}
