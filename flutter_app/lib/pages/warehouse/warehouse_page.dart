import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import 'warehouse_controller.dart';

class WarehousePage extends GetView<WarehouseController> {
  const WarehousePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('仓库管理')),
      backgroundColor: AppColors.bgPage,
      body: Obx(() {
        if (controller.loading.value) return const Center(child: CircularProgressIndicator());
        if (controller.inventory.isEmpty) return const EmptyState(iconData: Icons.warehouse_outlined, title: '暂无库存数据');
        return RefreshIndicator(
          onRefresh: controller.loadInventory,
          child: ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: controller.inventory.length,
            itemBuilder: (_, i) {
              final item = controller.inventory[i];
              return Container(
                margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(color: AppColors.bgCard, borderRadius: BorderRadius.circular(AppSpacing.md), border: Border.all(color: AppColors.borderLight)),
                child: Row(children: [
                  const Icon(Icons.inventory_2_outlined, size: 20, color: AppColors.primary),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(item['styleNo']?.toString() ?? item['productName']?.toString() ?? '-', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
                    Text('库存: ${item['quantity'] ?? 0}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ])),
                  Text(item['location']?.toString() ?? '', style: const TextStyle(fontSize: 12, color: AppColors.textTertiary)),
                ]),
              );
            },
          ),
        );
      }),
    );
  }
}
