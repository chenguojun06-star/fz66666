import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import 'cutting_controller.dart';

class CuttingPage extends GetView<CuttingController> {
  const CuttingPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('裁剪任务')),
      backgroundColor: AppColors.bgPage,
      body: Obx(() {
        if (controller.loading.value) return const Center(child: CircularProgressIndicator());
        if (controller.tasks.isEmpty) return const EmptyState(iconData: Icons.content_cut, title: '暂无裁剪任务');
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
                  const Icon(Icons.content_cut, size: 20, color: AppColors.warning),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(t['orderNo']?.toString() ?? '-', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
                    Text('菲号: ${t['bundleNo']?.toString() ?? '-'} · 数量: ${t['quantity'] ?? 0}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ])),
                  Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: AppColors.tagBgOrange, borderRadius: BorderRadius.circular(AppSpacing.sm)), child: const Text('裁剪', style: TextStyle(fontSize: 11, color: AppColors.warning))),
                ]),
              );
            },
          ),
        );
      }),
    );
  }
}
