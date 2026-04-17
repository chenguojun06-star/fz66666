import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import 'work_inbox_controller.dart';

class WorkInboxPage extends GetView<WorkInboxController> {
  const WorkInboxPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('消息')),
      backgroundColor: AppColors.bgPage,
      body: Obx(() {
        if (controller.loading.value) return const Center(child: CircularProgressIndicator());
        if (controller.notices.isEmpty) return const EmptyState(iconData: Icons.notifications_outlined, title: '暂无消息');
        return RefreshIndicator(
          onRefresh: controller.loadNotices,
          child: ListView.builder(padding: const EdgeInsets.all(AppSpacing.lg), itemCount: controller.notices.length, itemBuilder: (_, i) {
            final n = controller.notices[i];
            final isRead = n['read'] == true;
            return GestureDetector(
              onTap: () => controller.markRead(n['id']?.toString() ?? ''),
              child: Container(margin: const EdgeInsets.only(bottom: AppSpacing.sm), padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(color: isRead ? AppColors.bgCard : AppColors.primary.withValues(alpha: 0.04), borderRadius: BorderRadius.circular(AppSpacing.md), border: Border.all(color: isRead ? AppColors.borderLight : AppColors.primary.withValues(alpha: 0.2))),
                child: Row(children: [
                  if (!isRead) Container(width: 8, height: 8, decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
                  if (!isRead) const SizedBox(width: AppSpacing.sm),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(n['title']?.toString() ?? n['content']?.toString() ?? '-', style: TextStyle(fontSize: 14, fontWeight: isRead ? FontWeight.normal : FontWeight.w600, color: AppColors.textPrimary)),
                    Text(n['createTime']?.toString() ?? '', style: const TextStyle(fontSize: 11, color: AppColors.textTertiary)),
                  ])),
                ]),
              ),
            );
          }),
        );
      }),
    );
  }
}
