import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import 'bundle_split_controller.dart';

class BundleSplitPage extends GetView<BundleSplitController> {
  const BundleSplitPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('菲号单价')),
      backgroundColor: AppColors.bgPage,
      body: Column(children: [
        Padding(padding: const EdgeInsets.all(AppSpacing.lg), child: TextField(onChanged: controller.doSearch, decoration: const InputDecoration(hintText: '输入订单号查询', prefixIcon: Icon(Icons.search, size: 20)))),
        Expanded(child: Obx(() {
          if (controller.loading.value) return const Center(child: CircularProgressIndicator());
          if (controller.bundles.isEmpty) return const EmptyState(iconData: Icons.content_cut, title: '请输入订单号查询菲号');
          return ListView.builder(padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg), itemCount: controller.bundles.length, itemBuilder: (_, i) {
            final b = controller.bundles[i];
            return Container(margin: const EdgeInsets.only(bottom: AppSpacing.sm), padding: const EdgeInsets.all(AppSpacing.md), decoration: BoxDecoration(color: AppColors.bgCard, borderRadius: BorderRadius.circular(AppSpacing.md), border: Border.all(color: AppColors.borderLight)),
              child: Row(children: [
                const Icon(Icons.tag, size: 20, color: AppColors.warning),
                const SizedBox(width: AppSpacing.sm),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(b['bundleNo']?.toString() ?? '-', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
                  Text('数量: ${b['quantity'] ?? 0} · 单价: ¥${b['unitPrice'] ?? '0.00'}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                ])),
              ]));
          });
        })),
      ]),
    );
  }
}
