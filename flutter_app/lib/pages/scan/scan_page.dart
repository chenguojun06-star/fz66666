import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../utils/permission_service.dart';
import '../../components/empty_state.dart';
import 'scan_controller.dart';

class ScanPage extends GetView<ScanController> {
  const ScanPage({super.key});

  @override
  Widget build(BuildContext context) {
    Get.put(ScanController());
    return Scaffold(
      backgroundColor: AppColors.bgPage,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Obx(() => _buildStatsRow()),
              const SizedBox(height: AppSpacing.md),
              Obx(() => _buildOfflineHint()),
              const SizedBox(height: AppSpacing.sm),
              Obx(() => _buildScanTypeSelector()),
              const SizedBox(height: AppSpacing.lg),
              _buildScanArea(),
              const SizedBox(height: AppSpacing.md),
              Obx(() => _buildUndoButton()),
              const SizedBox(height: AppSpacing.lg),
              _buildQuickEntries(),
              const SizedBox(height: AppSpacing.xxl),
              Row(
                children: [
                  const Expanded(child: Text('今日扫码记录', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.textPrimary))),
                  GestureDetector(
                    onTap: controller.goToHistory,
                    child: const Text('查看全部', style: TextStyle(fontSize: 13, color: AppColors.primary)),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              Obx(() => _buildRecentList()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatsRow() {
    final tc = controller.todayCount.value;
    final tcc = controller.todayCompleted.value;
    return Row(
      children: [
        Expanded(child: _buildStatCard('今日扫码', '$tc', AppColors.primary)),
        const SizedBox(width: AppSpacing.md),
        Expanded(child: _buildStatCard('今日完成', '$tcc', AppColors.success)),
      ],
    );
  }

  Widget _buildStatCard(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(AppSpacing.lg),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: color)),
        ],
      ),
    );
  }

  Widget _buildOfflineHint() {
    if (controller.offlineCount.value == 0) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.tagBgOrange,
        borderRadius: BorderRadius.circular(AppSpacing.md),
      ),
      child: Row(
        children: [
          const Icon(Icons.cloud_off, size: 16, color: AppColors.warning),
          const SizedBox(width: 6),
          Expanded(
            child: Text('${controller.offlineCount.value}条扫码待上传，恢复网络后自动同步',
              style: const TextStyle(fontSize: 12, color: AppColors.warning)),
          ),
        ],
      ),
    );
  }

  Widget _buildScanTypeSelector() {
    final types = controller.allowedScanTypes;
    if (types.length <= 1) return const SizedBox.shrink();

    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: types.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final type = types[i];
          final isActive = controller.selectedScanType.value == type;
          return GestureDetector(
            onTap: () => controller.onScanTypeChanged(type),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: isActive ? AppColors.primary : AppColors.bgCard,
                borderRadius: BorderRadius.circular(AppSpacing.lg),
                border: Border.all(color: isActive ? AppColors.primary : AppColors.borderLight),
              ),
              child: Text(
                PermissionService.scanTypeLabel(type),
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: isActive ? Colors.white : AppColors.textSecondary),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildScanArea() {
    return Obx(() {
      if (!controller.scannerAvailable.value) {
        return GestureDetector(
          onTap: controller.onManualInput,
          child: Container(
            height: 220,
            decoration: BoxDecoration(
              color: AppColors.bgCard,
              borderRadius: BorderRadius.circular(AppSpacing.lg),
              border: Border.all(color: AppColors.borderLight),
            ),
            child: const Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.qr_code_scanner, size: 64, color: AppColors.primary),
                SizedBox(height: 12),
                Text('点击手动输入编码', style: TextStyle(fontSize: 16, color: AppColors.primary, fontWeight: FontWeight.w500)),
                SizedBox(height: 4),
                Text('当前设备不支持摄像头扫码', style: TextStyle(fontSize: 12, color: AppColors.textTertiary)),
              ],
            ),
          ),
        );
      }
      return Container(
        height: 220,
        decoration: BoxDecoration(
          color: AppColors.bgCard,
          borderRadius: BorderRadius.circular(AppSpacing.lg),
          border: Border.all(color: AppColors.borderLight),
        ),
        child: Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(AppSpacing.lg),
              child: controller.scannerWidget,
            ),
            Positioned(
              right: 12,
              bottom: 12,
              child: GestureDetector(
                onTap: controller.onManualInput,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(AppSpacing.md),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.keyboard, size: 16, color: Colors.white),
                      SizedBox(width: 4),
                      Text('手动输入', style: TextStyle(fontSize: 12, color: Colors.white)),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    });
  }

  Widget _buildUndoButton() {
    if (controller.recentScans.isEmpty) return const SizedBox.shrink();
    return Align(
      alignment: Alignment.centerRight,
      child: GestureDetector(
        onTap: controller.undoLastScan,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.bgCard,
            borderRadius: BorderRadius.circular(AppSpacing.md),
            border: Border.all(color: AppColors.borderLight),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.undo, size: 16, color: AppColors.textSecondary),
              SizedBox(width: 4),
              Text('撤销上次', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildQuickEntries() {
    return Row(
      children: [
        Expanded(child: _buildQuickEntry(Icons.history, '扫码历史', AppColors.purple, controller.goToHistory)),
        const SizedBox(width: AppSpacing.md),
        Expanded(child: _buildQuickEntry(Icons.checkroom, '样衣扫码', AppColors.warning, controller.goToPattern)),
        const SizedBox(width: AppSpacing.md),
        Obx(() {
          final count = controller.pendingQualityTasks.value + controller.pendingRepairTasks.value;
          return _buildQuickEntry(
            Icons.verified_user,
            '质检任务',
            AppColors.success,
            controller.goToQuality,
            badge: count > 0 ? '$count' : null,
          );
        }),
      ],
    );
  }

  Widget _buildQuickEntry(IconData icon, String label, Color color, VoidCallback onTap, {String? badge}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
        decoration: BoxDecoration(
          color: AppColors.bgCard,
          borderRadius: BorderRadius.circular(AppSpacing.md),
          border: Border.all(color: AppColors.borderLight),
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Column(
              children: [
                Icon(icon, size: 24, color: color),
                const SizedBox(height: 4),
                Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textPrimary)),
              ],
            ),
            if (badge != null)
              Positioned(
                right: -4,
                top: -4,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  decoration: BoxDecoration(
                    color: AppColors.error,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  constraints: const BoxConstraints(minWidth: 16),
                  child: Text(badge, style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildRecentList() {
    final scans = controller.recentScans;
    if (scans.isEmpty) {
      return const EmptyState(iconData: Icons.qr_code, title: '暂无扫码记录', subtitle: '扫码后记录将显示在这里');
    }
    return Column(
      children: scans.take(10).map((scan) {
        return Container(
          margin: const EdgeInsets.only(bottom: AppSpacing.sm),
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: AppColors.bgCard,
            borderRadius: BorderRadius.circular(AppSpacing.md),
            border: Border.all(color: AppColors.borderLight),
          ),
          child: Row(
            children: [
              const Icon(Icons.qr_code, size: 20, color: AppColors.primary),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(scan['orderNo']?.toString() ?? scan['qrCode']?.toString() ?? '-',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
                    Text(scan['processName']?.toString() ?? '', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ],
                ),
              ),
              Text(scan['scanTime']?.toString() ?? '', style: const TextStyle(fontSize: 11, color: AppColors.textTertiary)),
            ],
          ),
        );
      }).toList(),
    );
  }
}
