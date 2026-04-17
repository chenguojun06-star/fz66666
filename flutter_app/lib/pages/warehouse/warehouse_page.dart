import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'warehouse_controller.dart';

class WarehousePage extends GetView<WarehouseController> {
  const WarehousePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[50], // 轻微偏灰背景，让白色卡片更立体
      appBar: AppBar(
        title: const Text('成品仓库管理', style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: true,
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 0.5,
        actions: [
          IconButton(
            icon: const Icon(Icons.qr_code_scanner, color: Colors.blueAccent),
            onPressed: () => Get.toNamed('/scan'), // 服装软件最核心的扫码入库入口
          ),
        ],
      ),
      body: Column(
        children: [
          // 搜索与统计栏 - 专业软件的核心：快速过滤
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            color: Colors.white,
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    onChanged: (v) => controller.searchQuery.value = v,
                    decoration: InputDecoration(
                      hintText: '搜索款式、编号...',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                      fillColor: Colors.grey[100],
                      filled: true,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Obx(() => _buildStatItem('在库', '${controller.inventoryList.length}')),
              ],
            ),
          ),

          Expanded(
            child: Obx(() {
              if (controller.isLoading.value && controller.inventoryList.isEmpty) {
                return const Center(child: CircularProgressIndicator(strokeWidth: 2));
              }

              final items = controller.filteredInventory;
              if (items.isEmpty) {
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.inventory_2_outlined, size: 64, color: Colors.grey[300]),
                      const SizedBox(height: 12),
                      Text('未找到相关库存', style: TextStyle(color: Colors.grey[400])),
                    ],
                  ),
                );
              }

              return RefreshIndicator(
                onRefresh: controller.fetchInventory,
                child: ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: items.length,
                  itemBuilder: (context, index) {
                    final item = items[index];
                    return _buildInventoryCard(context, item);
                  },
                ),
              );
            }),
          ),
        ],
      ),
      // 出库快捷操作按钮
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Get.snackbar('通知', '请使用右上角扫码进行批量出库'),
        label: const Text('批量操作', style: TextStyle(fontWeight: FontWeight.bold)),
        icon: const Icon(Icons.unarchive_outlined),
        backgroundColor: Colors.blueAccent[700],
      ),
    );
  }

  Widget _buildStatItem(String label, String value) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.blueAccent)),
        Text(label, style: TextStyle(fontSize: 10, color: Colors.grey[600])),
      ],
    );
  }

  Widget _buildInventoryCard(BuildContext context, dynamic item) {
    // 假设数据结构中包含 styleName, styleNo, quantity, location
    final String styleName = item['styleName'] ?? '未命名款式';
    final String styleNo = item['styleNo'] ?? 'SN-000';
    final String quantity = item['quantity']?.toString() ?? '0';
    final String location = item['location'] ?? '待分配库位';

    return Card(
      elevation: 0.5,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: () {
          // 点击进入库存详情
          Get.snackbar('详情', '款式 $styleName 的实时库位为：$location');
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            children: [
              // 模拟款式预览图占位
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: Colors.blue[50],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.checkroom, color: Colors.blueAccent),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(styleName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text('款式号: $styleNo', style: TextStyle(color: Colors.grey[600], fontSize: 13)),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.location_on_outlined, size: 14, color: Colors.orangeAccent),
                        const SizedBox(width: 4),
                        Text(location, style: TextStyle(color: Colors.grey[500], fontSize: 12)),
                      ],
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text('当前在库', style: TextStyle(fontSize: 10, color: Colors.grey)),
                  Text(quantity, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.blueAccent)),
                  const Text('件', style: TextStyle(fontSize: 10, color: Colors.blueAccent)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
