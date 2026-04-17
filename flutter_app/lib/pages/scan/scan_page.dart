import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
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
              const SizedBox(height: AppSpacing.lg),
              _buildScanArea(),
              const SizedBox(height: AppSpacing.lg),
              _buildQuickEntries(),
              const SizedBox(height: AppSpacing.xxl),
              const Text('今日扫码记录', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
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
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppSpacing.lg),
          child: controller.scannerWidget,
        ),
      );
    });
  }

  Widget _buildQuickEntries() {
    return Row(
      children: [
        Expanded(
          child: GestureDetector(
            onTap: controller.goToHistory,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.bgCard,
                borderRadius: BorderRadius.circular(AppSpacing.md),
                border: Border.all(color: AppColors.borderLight),
              ),
              child: const Column(
                children: [
                  Icon(Icons.history, size: 24, color: AppColors.purple),
                  SizedBox(height: 4),
                  Text('扫码历史', style: TextStyle(fontSize: 13, color: AppColors.textPrimary)),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: GestureDetector(
            onTap: controller.goToPattern,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.bgCard,
                borderRadius: BorderRadius.circular(AppSpacing.md),
                border: Border.all(color: AppColors.borderLight),
              ),
              child: const Column(
                children: [
                  Icon(Icons.checkroom, size: 24, color: AppColors.warning),
                  SizedBox(height: 4),
                  Text('样衣扫码', style: TextStyle(fontSize: 13, color: AppColors.textPrimary)),
                ],
              ),
            ),
          ),
        ),
      ],
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
