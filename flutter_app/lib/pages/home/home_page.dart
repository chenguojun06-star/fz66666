import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../routes/app_routes.dart';
import 'home_controller.dart';

class HomePage extends GetView<HomeController> {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    Get.put(HomeController());
    return Scaffold(
      backgroundColor: AppColors.bgPage,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: controller.refreshData,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Obx(() => _buildGreeting()),
                const SizedBox(height: AppSpacing.lg),
                Obx(() => _buildDateCard(controller.dateInfo)),
                const SizedBox(height: AppSpacing.md),
                Obx(() => _buildDailyTip()),
                const SizedBox(height: AppSpacing.xxl),
                Row(
                  children: [
                    const Expanded(child: Text('全部菜单', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.textPrimary))),
                    Obx(() => _buildNotificationBadge()),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                _buildMenuGrid(controller.getMenuItems()),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildGreeting() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('${controller.userName.value}，${controller.greeting.value}',
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
        const SizedBox(height: 4),
        const Text('欢迎使用衣智链', style: TextStyle(fontSize: 14, color: AppColors.textSecondary)),
      ],
    );
  }

  Widget _buildDateCard(Map<String, String> info) {
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
          Text(info['icon'] ?? '', style: const TextStyle(fontSize: 36)),
          const SizedBox(width: AppSpacing.md),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(info['date'] ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              Text(info['day'] ?? '', style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
            ],
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(AppSpacing.lg),
            ),
            child: Text(info['season'] ?? '', style: const TextStyle(fontSize: 14, color: AppColors.primary, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }

  Widget _buildDailyTip() {
    final tip = controller.dailyTip.value;
    if (tip.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(AppSpacing.md),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          const Icon(Icons.lightbulb_outline, size: 18, color: AppColors.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(tip, style: const TextStyle(fontSize: 13, color: AppColors.primary, fontWeight: FontWeight.w400)),
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationBadge() {
    final count = controller.unreadNoticeCount.value;
    if (count == 0) return const SizedBox.shrink();
    return GestureDetector(
      onTap: () => Get.toNamed(AppRoutes.workInbox),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.tagBgRed,
          borderRadius: BorderRadius.circular(AppSpacing.lg),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.notifications_active, size: 14, color: AppColors.error),
            const SizedBox(width: 4),
            Text('$count条未读', style: const TextStyle(fontSize: 12, color: AppColors.error, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }

  Widget _buildMenuGrid(List<Map<String, dynamic>> items) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: AppSpacing.md,
        crossAxisSpacing: AppSpacing.md,
        childAspectRatio: 1.1,
      ),
      itemCount: items.length,
      itemBuilder: (_, i) {
        final item = items[i];
        return GestureDetector(
          onTap: () => controller.onMenuTap(
            item['route'] as String,
            prefTab: item['prefTab'] as String?,
          ),
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.bgCard,
              borderRadius: BorderRadius.circular(AppSpacing.lg),
              border: Border.all(color: AppColors.borderLight),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: Color(item['color'] as int).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(item['icon'] as IconData, size: 24, color: Color(item['color'] as int)),
                ),
                const SizedBox(height: 8),
                Text(item['name'] as String, style: const TextStyle(fontSize: 13, color: AppColors.textPrimary, fontWeight: FontWeight.w500)),
              ],
            ),
          ),
        );
      },
    );
  }
}
