import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import '../../components/summary_card.dart';
import '../../routes/app_routes.dart';
import 'payroll_controller.dart';

class PayrollPage extends GetView<PayrollController> {
  const PayrollPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('当月工资')),
      backgroundColor: AppColors.bgPage,
      body: Obx(() {
        if (controller.loading.value) return const Center(child: CircularProgressIndicator());
        if (controller.stats.isEmpty) return const EmptyState(iconData: Icons.payments_outlined, title: '暂无工资数据');
        return SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            children: [
              SummaryCard(title: '当月统计', items: [
                SummaryItem(label: '扫码总数', value: '${controller.stats['todayCount'] ?? 0}'),
                SummaryItem(label: '完成数', value: '${controller.stats['todayCompleted'] ?? 0}'),
                SummaryItem(label: '计件工资', value: '¥${controller.stats['totalEarnings'] ?? '0.00'}', color: AppColors.primary),
              ]),
              const SizedBox(height: AppSpacing.md),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => Get.toNamed(AppRoutes.wageFeedback),
                  icon: const Icon(Icons.feedback_outlined, size: 18),
                  label: const Text('工资结算反馈'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    side: const BorderSide(color: AppColors.primary),
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
                  ),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }
}
