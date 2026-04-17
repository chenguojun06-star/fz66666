import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import 'admin_approval_controller.dart';

class AdminApprovalPage extends GetView<AdminApprovalController> {
  const AdminApprovalPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('用户审批')),
      backgroundColor: AppColors.bgPage,
      body: Obx(() {
        if (controller.loading.value) {
          return const Center(child: CircularProgressIndicator());
        }
        if (controller.pendingUsers.isEmpty) {
          return const EmptyState(iconData: Icons.check_circle_outline, title: '暂无待审批用户', subtitle: '所有用户都已处理');
        }
        return RefreshIndicator(
          onRefresh: controller.loadPendingUsers,
          child: ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: controller.pendingUsers.length,
            itemBuilder: (_, i) => _buildUserCard(controller.pendingUsers[i]),
          ),
        );
      }),
    );
  }

  Widget _buildUserCard(Map<String, dynamic> user) {
    final name = user['realName']?.toString() ?? user['name']?.toString() ?? '未知';
    final phone = user['phone']?.toString() ?? user['username']?.toString() ?? '-';
    final role = user['roleName']?.toString() ?? user['roleCode']?.toString() ?? '-';
    final userId = user['id']?.toString() ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(AppSpacing.lg),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 4, offset: const Offset(0, 2))],
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: AppColors.primary.withValues(alpha: 0.1),
            child: Text(name.isNotEmpty ? name[0] : '?', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.primary)),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                const SizedBox(height: 2),
                Text('$phone · $role', style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
              ],
            ),
          ),
          Column(
            children: [
              SizedBox(
                width: 72,
                height: 32,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.success, padding: EdgeInsets.zero),
                  onPressed: () => controller.approveUser(userId),
                  child: const Text('通过', style: TextStyle(fontSize: 13)),
                ),
              ),
              const SizedBox(height: 6),
              SizedBox(
                width: 72,
                height: 32,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(foregroundColor: AppColors.error, side: const BorderSide(color: AppColors.error), padding: EdgeInsets.zero),
                  onPressed: () => controller.confirmReject(userId),
                  child: const Text('拒绝', style: TextStyle(fontSize: 13)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
