import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';
import '../../components/empty_state.dart';

class ScanQualityController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final tasks = <Map<String, dynamic>>[].obs;
  final loading = false.obs;

  @override
  void onInit() {
    super.onInit();
    loadTasks();
  }

  Future<void> loadTasks() async {
    loading.value = true;
    try {
      final res = await _api.myQualityTasks();
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final list = data['data'] as List? ?? [];
        tasks.value = list.map((e) => e as Map<String, dynamic>).toList();
      }
    } catch (e) {
      ErrorHandler.handle(e);
    } finally {
      loading.value = false;
    }
  }

  Future<void> submitQuality(String orderId, int qualified, int defective, {String? remark}) async {
    try {
      final res = await _api.executeScan({
        'orderId': orderId,
        'qualified': qualified,
        'defective': defective,
        'remark': remark,
        'type': 'quality_confirm',
      });
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('成功', '质检已提交', snackPosition: SnackPosition.TOP, backgroundColor: AppColors.success, colorText: Colors.white);
        loadTasks();
      } else {
        final msg = data is Map ? (data['message'] ?? '提交失败') : '提交失败';
        Get.snackbar('失败', msg.toString(), snackPosition: SnackPosition.TOP);
      }
    } catch (e) {
      ErrorHandler.handle(e);
    }
  }
}
