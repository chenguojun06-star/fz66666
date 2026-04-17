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
              const SizedBox(height: AppSpacing.xxl),
              _buildVersionInfo(),
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
      child: Column(
        children: [
          Row(
            children: [
              _buildAvatar(),
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
                  ],
                ),
              ),
            ],
          ),
          if (controller.tenantName.value.isNotEmpty || controller.factoryName.value.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            const Divider(height: 1),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                if (controller.tenantName.value.isNotEmpty) ...[
                  const Icon(Icons.business, size: 14, color: AppColors.textTertiary),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(controller.tenantName.value,
                      style: const TextStyle(fontSize: 12, color: AppColors.textTertiary),
                      overflow: TextOverflow.ellipsis),
                  ),
                ],
                if (controller.tenantName.value.isNotEmpty && controller.factoryName.value.isNotEmpty)
                  const SizedBox(width: AppSpacing.md),
                if (controller.factoryName.value.isNotEmpty) ...[
                  const Icon(Icons.factory, size: 14, color: AppColors.textTertiary),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(controller.factoryName.value,
                      style: const TextStyle(fontSize: 12, color: AppColors.textTertiary),
                      overflow: TextOverflow.ellipsis),
                  ),
                ],
                if (controller.showApprovalEntry.value) ...[
                  const SizedBox(width: AppSpacing.md),
                  const Icon(Icons.people_outline, size: 14, color: AppColors.textTertiary),
                  const SizedBox(width: 4),
                  Text('${controller.onlineCount.value}人在线', style: const TextStyle(fontSize: 12, color: AppColors.textTertiary)),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildAvatar() {
    final url = controller.avatarUrl.value;
    if (url.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(26),
        child: Image.network(
          url,
          width: 52,
          height: 52,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _buildDefaultAvatar(),
        ),
      );
    }
    return _buildDefaultAvatar();
  }

  Widget _buildDefaultAvatar() {
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.primary, AppColors.primaryLight],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(26),
      ),
      alignment: Alignment.center,
      child: Text(controller.avatarLetter,
        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: Colors.white)),
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
          final badge = item['badge'] as int? ?? 0;
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
                      if (badge > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: AppColors.error,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          constraints: const BoxConstraints(minWidth: 18),
                          child: Text('$badge',
                            style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w600),
                            textAlign: TextAlign.center),
                        ),
                      if (badge == 0)
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

  Widget _buildVersionInfo() {
    return Center(
      child: Obx(() => Text(
        '衣智链 ${controller.appVersion.value}',
        style: const TextStyle(fontSize: 12, color: AppColors.textTertiary),
      )),
    );
  }
}
