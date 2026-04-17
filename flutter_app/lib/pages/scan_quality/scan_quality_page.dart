import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import 'scan_quality_controller.dart';

class ScanQualityPage extends GetView<ScanQualityController> {
  const ScanQualityPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('质检任务')),
      backgroundColor: AppColors.bgPage,
      body: Obx(() {
        if (controller.loading.value) {
          return const Center(child: CircularProgressIndicator());
        }
        if (controller.tasks.isEmpty) {
          return const EmptyState(iconData: Icons.verified_outlined, title: '暂无质检任务', subtitle: '有新任务时会自动显示');
        }
        return RefreshIndicator(
          onRefresh: controller.loadTasks,
          child: ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: controller.tasks.length,
            itemBuilder: (_, i) => _buildTaskCard(controller.tasks[i]),
          ),
        );
      }),
    );
  }

  Widget _buildTaskCard(Map<String, dynamic> task) {
    final orderNo = task['orderNo']?.toString() ?? '-';
    final processName = task['processName']?.toString() ?? '';
    final quantity = task['quantity'] ?? 0;
    final orderId = task['orderId']?.toString() ?? task['id']?.toString() ?? '';

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
              Expanded(child: Text(orderNo, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: AppColors.tagBgGreen, borderRadius: BorderRadius.circular(AppSpacing.sm)),
                child: const Text('待质检', style: TextStyle(fontSize: 11, color: AppColors.success)),
              ),
            ],
          ),
          if (processName.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(processName, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              Text('数量: $quantity', style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
              const Spacer(),
              SizedBox(
                height: 32,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.success, padding: const EdgeInsets.symmetric(horizontal: 16)),
                  onPressed: () => controller.submitQuality(orderId, quantity, 0),
                  child: const Text('合格', style: TextStyle(fontSize: 13)),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                height: 32,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(foregroundColor: AppColors.error, side: const BorderSide(color: AppColors.error), padding: const EdgeInsets.symmetric(horizontal: 16)),
                  onPressed: () => controller.submitQuality(orderId, 0, quantity),
                  child: const Text('次品', style: TextStyle(fontSize: 13)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
