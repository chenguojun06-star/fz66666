import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class WarehouseController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final inventory = <Map<String, dynamic>>[].obs;
  final loading = false.obs;

  @override
  void onInit() { super.onInit(); loadInventory(); }

  Future<void> loadInventory() async {
    loading.value = true;
    try {
      final res = await _api.listFinishedInventory();
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final list = data['data'] as List? ?? [];
        inventory.value = list.map((e) => e as Map<String, dynamic>).toList();
      }
    } catch (e) { ErrorHandler.handle(e); }
    finally { loading.value = false; }
  }

  Future<void> outbound(String id, int quantity) async {
    try {
      final res = await _api.outboundFinishedInventory({'id': id, 'quantity': quantity});
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('成功', '出库成功', snackPosition: SnackPosition.TOP, backgroundColor: AppColors.success, colorText: Colors.white);
        loadInventory();
      }
    } catch (e) { ErrorHandler.handle(e); }
  }
}
