import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import 'procurement_controller.dart';

class ProcurementPage extends GetView<ProcurementController> {
  const ProcurementPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('采购任务')),
      backgroundColor: AppColors.bgPage,
      body: Obx(() {
        if (controller.loading.value) return const Center(child: CircularProgressIndicator());
        if (controller.tasks.isEmpty) return const EmptyState(iconData: Icons.local_shipping_outlined, title: '暂无采购任务');
        return RefreshIndicator(
          onRefresh: controller.loadTasks,
          child: ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: controller.tasks.length,
            itemBuilder: (_, i) {
              final t = controller.tasks[i];
              return Container(
                margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(color: AppColors.bgCard, borderRadius: BorderRadius.circular(AppSpacing.md), border: Border.all(color: AppColors.borderLight)),
                child: Row(children: [
                  const Icon(Icons.local_shipping_outlined, size: 20, color: AppColors.info),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(t['materialName']?.toString() ?? t['orderNo']?.toString() ?? '-', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
                    Text('数量: ${t['quantity'] ?? 0}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ])),
                  SizedBox(height: 32, child: ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: AppColors.success, padding: const EdgeInsets.symmetric(horizontal: 12)), onPressed: () => controller.receivePurchase(t['id']?.toString() ?? ''), child: const Text('收货', style: TextStyle(fontSize: 12)))),
                ]),
              );
            },
          ),
        );
      }),
    );
  }
}
