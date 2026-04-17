import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class ProcurementController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final tasks = <Map<String, dynamic>>[].obs;
  final loading = false.obs;

  @override
  void onInit() { super.onInit(); loadTasks(); }

  Future<void> loadTasks() async {
    loading.value = true;
    try {
      final res = await _api.myProcurementTasks();
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final list = data['data'] as List? ?? [];
        tasks.value = list.map((e) => e as Map<String, dynamic>).toList();
      }
    } catch (e) { ErrorHandler.handle(e); }
    finally { loading.value = false; }
  }

  Future<void> receivePurchase(String purchaseId) async {
    try {
      final res = await _api.receivePurchase({'purchaseId': purchaseId});
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('成功', '已确认收货', snackPosition: SnackPosition.TOP, backgroundColor: AppColors.success, colorText: Colors.white);
        loadTasks();
      }
    } catch (e) { ErrorHandler.handle(e); }
  }
}
