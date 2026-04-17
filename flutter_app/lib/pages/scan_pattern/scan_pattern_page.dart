import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import 'scan_pattern_controller.dart';

class ScanPatternPage extends GetView<ScanPatternController> {
  const ScanPatternPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('样衣扫码')),
      backgroundColor: AppColors.bgPage,
      body: Obx(() {
        if (controller.loading.value) return const Center(child: CircularProgressIndicator());
        if (controller.patternDetail.isEmpty) return const EmptyState(iconData: Icons.checkroom, title: '请扫码或输入样衣编码');
        return SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('样衣信息', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
            const SizedBox(height: AppSpacing.md),
            Container(width: double.infinity, padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(color: AppColors.bgCard, borderRadius: BorderRadius.circular(AppSpacing.lg), border: Border.all(color: AppColors.borderLight)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(controller.patternDetail['styleNo']?.toString() ?? '-', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                const SizedBox(height: 4),
                Text('款名: ${controller.patternDetail['styleName']?.toString() ?? '-'}', style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
              ]),
            ),
          ]),
        );
      }),
    );
  }
}
