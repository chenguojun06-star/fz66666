import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import 'admin_controller.dart';

class AdminPage extends GetView<AdminController> {
  const AdminPage({super.key});

  @override
  Widget build(BuildContext context) {
    Get.put(AdminController());
    return Scaffold(
      backgroundColor: AppColors.bgPage,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            children: [
              Obx(() => _buildProfileCard()),
              const SizedBox(height: AppSpacing.lg),
              Obx(() => _buildMenuList()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildProfileCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(AppSpacing.lg),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(26),
            ),
            alignment: Alignment.center,
            child: Text(controller.avatarLetter,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: AppColors.primary)),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(controller.userName.value,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textPrimary))),
                    GestureDetector(
                      onTap: controller.onLogout,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.bgGray,
                          borderRadius: BorderRadius.circular(AppSpacing.sm),
                        ),
                        child: const Text('退出', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(controller.roleDisplayName.value, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                if (controller.showApprovalEntry.value) ...[
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      const Icon(Icons.people_outline, size: 14, color: AppColors.textTertiary),
                      const SizedBox(width: 4),
                      Text('${controller.onlineCount.value}人在线', style: const TextStyle(fontSize: 12, color: AppColors.textTertiary)),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMenuList() {
    final items = controller.getMenuItems();
    return Container(
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(AppSpacing.lg),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        children: items.map((item) {
          final isLast = items.indexOf(item) == items.length - 1;
          return Column(
            children: [
              InkWell(
                onTap: () => controller.onMenuTap(item['route'] as String),
                borderRadius: BorderRadius.circular(AppSpacing.md),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
                  child: Row(
                    children: [
                      Icon(IconData(item['icon'] as int, fontFamily: 'MaterialIcons'), size: 22, color: AppColors.textSecondary),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(child: Text(item['label'] as String, style: const TextStyle(fontSize: 15, color: AppColors.textPrimary))),
                      const Icon(Icons.chevron_right, size: 20, color: AppColors.textTertiary),
                    ],
                  ),
                ),
              ),
              if (!isLast) const Divider(height: 1, indent: 56, endIndent: 16),
            ],
          );
        }).toList(),
      ),
    );
  }
}
