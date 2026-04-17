import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import 'admin_invite_controller.dart';

class AdminInvitePage extends GetView<AdminInviteController> {
  const AdminInvitePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('邀请员工')),
      backgroundColor: AppColors.bgPage,
      body: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.xxl),
              decoration: BoxDecoration(
                color: AppColors.bgCard,
                borderRadius: BorderRadius.circular(AppSpacing.lg),
                border: Border.all(color: AppColors.borderLight),
              ),
              child: const Column(
                children: [
                  Icon(Icons.card_giftcard, size: 48, color: AppColors.primary),
                  SizedBox(height: AppSpacing.md),
                  Text('邀请员工加入', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                  SizedBox(height: AppSpacing.sm),
                  Text('分享以下链接给新员工，他们注册后将自动加入您的公司', style: TextStyle(fontSize: 14, color: AppColors.textSecondary), textAlign: TextAlign.center),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xxl),
            const Text('邀请链接', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
            const SizedBox(height: AppSpacing.sm),
            Obx(() => Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.bgGray,
                borderRadius: BorderRadius.circular(AppSpacing.md),
                border: Border.all(color: AppColors.borderLight),
              ),
              child: Row(
                children: [
                  Expanded(child: Text(controller.inviteLink.value, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary))),
                  GestureDetector(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: controller.inviteLink.value));
                      Get.snackbar('已复制', '邀请链接已复制到剪贴板', snackPosition: SnackPosition.TOP);
                    },
                    child: const Icon(Icons.copy, size: 20, color: AppColors.primary),
                  ),
                ],
              ),
            )),
          ],
        ),
      ),
    );
  }
}
