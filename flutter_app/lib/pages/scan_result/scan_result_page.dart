import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/summary_card.dart';
import 'scan_result_controller.dart';

class ScanResultPage extends GetView<ScanResultController> {
  const ScanResultPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('扫码结果')),
      backgroundColor: AppColors.bgPage,
      body: Obx(() {
        if (controller.result.isEmpty) return const Center(child: Text('无结果数据', style: TextStyle(color: AppColors.textTertiary)));
        return SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: SummaryCard(title: '扫码结果', items: controller.result.entries.map((e) => SummaryItem(label: e.key, value: e.value?.toString() ?? '-')).toList()),
        );
      }),
    );
  }
}
