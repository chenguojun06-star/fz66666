import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import 'admin_feedback_controller.dart';

class AdminFeedbackPage extends GetView<AdminFeedbackController> {
  const AdminFeedbackPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('意见反馈')),
      backgroundColor: AppColors.bgPage,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              onChanged: (v) => controller.content.value = v,
              maxLines: 5,
              decoration: const InputDecoration(hintText: '请输入您的意见或建议...', alignLabelWithHint: true),
            ),
            const SizedBox(height: AppSpacing.md),
            Obx(() => SizedBox(
              width: double.infinity,
              height: 44,
              child: ElevatedButton(
                onPressed: controller.loading.value ? null : controller.submitFeedback,
                child: controller.loading.value
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('提交反馈'),
              ),
            )),
            const SizedBox(height: AppSpacing.xxl),
            const Text('历史反馈', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
            const SizedBox(height: AppSpacing.md),
            Obx(() {
              if (controller.feedbackList.isEmpty) {
                return const EmptyState(iconData: Icons.feedback_outlined, title: '暂无反馈记录');
              }
              return Column(
                children: controller.feedbackList.map((f) => Container(
                  margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(color: AppColors.bgCard, borderRadius: BorderRadius.circular(AppSpacing.md), border: Border.all(color: AppColors.borderLight)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(f['content']?.toString() ?? '', style: const TextStyle(fontSize: 14, color: AppColors.textPrimary)),
                      const SizedBox(height: 4),
                      Text(f['createTime']?.toString() ?? '', style: const TextStyle(fontSize: 11, color: AppColors.textTertiary)),
                    ],
                  ),
                )).toList(),
              );
            }),
          ],
        ),
      ),
    );
  }
}
