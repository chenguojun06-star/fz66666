import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import '../../components/load_more.dart';
import 'scan_history_controller.dart';

class ScanHistoryPage extends GetView<ScanHistoryController> {
  const ScanHistoryPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('扫码历史')),
      backgroundColor: AppColors.bgPage,
      body: Obx(() {
        if (controller.loading.value && controller.records.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }
        if (controller.records.isEmpty) {
          return const EmptyState(iconData: Icons.history, title: '暂无扫码记录', subtitle: '扫码后记录将显示在这里');
        }
        return RefreshIndicator(
          onRefresh: () => controller.loadRecords(reset: true),
          child: ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: controller.records.length + 1,
            itemBuilder: (_, i) {
              if (i == controller.records.length) {
                return LoadMore(status: controller.hasMore.value ? LoadMoreStatus.idle : LoadMoreStatus.noMore, onLoadMore: () => controller.loadRecords());
              }
              final r = controller.records[i];
              return Container(
                margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(color: AppColors.bgCard, borderRadius: BorderRadius.circular(AppSpacing.md), border: Border.all(color: AppColors.borderLight)),
                child: Row(
                  children: [
                    const Icon(Icons.qr_code, size: 20, color: AppColors.primary),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(r['orderNo']?.toString() ?? r['qrCode']?.toString() ?? '-', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
                        Text(r['processName']?.toString() ?? '', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                      ],
                    )),
                    Text(r['scanTime']?.toString() ?? '', style: const TextStyle(fontSize: 11, color: AppColors.textTertiary)),
                  ],
                ),
              );
            },
          ),
        );
      }),
    );
  }
}
