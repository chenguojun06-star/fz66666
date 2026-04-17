import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/summary_card.dart';
import 'scan_confirm_controller.dart';

class ScanConfirmPage extends GetView<ScanConfirmController> {
  const ScanConfirmPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('扫码确认')),
      backgroundColor: AppColors.bgPage,
      body: Obx(() {
        if (controller.loading.value) {
          return const Center(child: CircularProgressIndicator());
        }
        return SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SummaryCard(
                title: '扫码信息',
                items: [
                  SummaryItem(label: '订单号', value: controller.orderNo.value),
                  SummaryItem(label: '菲号', value: controller.bundleNo.value),
                  SummaryItem(label: '工序', value: controller.processName.value),
                  SummaryItem(label: '数量', value: controller.quantity.value, color: AppColors.primary),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              SummaryCard(
                title: '扫码详情',
                items: controller.details.map((d) => SummaryItem(label: d.key, value: d.value)).toList(),
              ),
              const SizedBox(height: AppSpacing.xxl),
              SizedBox(
                width: double.infinity,
                height: 44,
                child: ElevatedButton(
                  onPressed: controller.confirm,
                  child: const Text('确认提交'),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              SizedBox(
                width: double.infinity,
                height: 44,
                child: OutlinedButton(
                  onPressed: () => Get.back(),
                  child: const Text('取消'),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }
}
