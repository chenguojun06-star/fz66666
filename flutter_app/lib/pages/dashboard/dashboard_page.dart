import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import 'dashboard_controller.dart';

class DashboardPage extends GetView<DashboardController> {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('数据看板')),
      backgroundColor: AppColors.bgPage,
      body: Obx(() {
        if (controller.loading.value) {
          return const Center(child: CircularProgressIndicator());
        }
        return RefreshIndicator(
          onRefresh: controller.loadData,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: _statCard('订单总数', '${controller.totalOrders.value}', AppColors.primary)),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(child: _statCard('入库总数', '${controller.totalWarehoused.value}', AppColors.success)),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                Row(
                  children: [
                    Expanded(child: _statCard('不合格数', '${controller.totalDefective.value}', AppColors.error)),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(child: _statCard('采购数', '${controller.totalProcurement.value}', AppColors.warning)),
                  ],
                ),
                const SizedBox(height: AppSpacing.xxl),
                const Text('今日活动', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                const SizedBox(height: AppSpacing.md),
                if (controller.activities.isEmpty)
                  const EmptyState(iconData: Icons.inbox_outlined, title: '暂无活动')
                else
                  ...controller.activities.map((a) => _activityItem(a)),
              ],
            ),
          ),
        );
      }),
    );
  }

  Widget _statCard(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(AppSpacing.lg),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: color)),
        ],
      ),
    );
  }

  Widget _activityItem(Map<String, dynamic> a) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(AppSpacing.md),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Row(
        children: [
          Icon(Icons.circle, size: 8, color: (a['color'] == 'red' ? AppColors.error : a['color'] == 'green' ? AppColors.success : AppColors.primary)),
          const SizedBox(width: AppSpacing.sm),
          Expanded(child: Text(a['description']?.toString() ?? a['message']?.toString() ?? '-', style: const TextStyle(fontSize: 14, color: AppColors.textPrimary))),
          Text(a['time']?.toString() ?? '', style: const TextStyle(fontSize: 11, color: AppColors.textTertiary)),
        ],
      ),
    );
  }
}
