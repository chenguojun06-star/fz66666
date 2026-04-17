import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import 'scan_rescan_controller.dart';

class ScanRescanPage extends GetView<ScanRescanController> {
  const ScanRescanPage({super.key});

  @override
  Widget build(BuildContext context) {
    final codeController = TextEditingController();
    return Scaffold(
      appBar: AppBar(title: const Text('重新扫码')),
      backgroundColor: AppColors.bgPage,
      body: Padding(padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(children: [
          TextField(controller: codeController, decoration: const InputDecoration(hintText: '输入菲号/编码', prefixIcon: Icon(Icons.qr_code, size: 20))),
          const SizedBox(height: AppSpacing.lg),
          Obx(() => SizedBox(width: double.infinity, height: 44, child: ElevatedButton(
            onPressed: controller.loading.value ? null : () => controller.doRescan(codeController.text.trim()),
            child: controller.loading.value ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('提交重扫'),
          ))),
        ]),
      ),
    );
  }
}
