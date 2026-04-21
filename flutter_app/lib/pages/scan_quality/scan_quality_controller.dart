import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

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

  Future<void> submitQuality(String orderId, int qualified, int defective, {String? remark, String? scanCode, String? orderNo}) async {
    try {
      final receiveRes = await _api.executeScan({
        'scanCode': scanCode ?? orderId,
        'orderNo': orderNo ?? '',
        'orderId': orderId,
        'scanType': 'quality',
        'qualityStage': 'receive',
        'quantity': qualified + defective,
        'source': 'flutter',
      });
      final receiveData = receiveRes.data;
      if (receiveData is! Map || receiveData['code'] != 200) {
        final msg = receiveData is Map ? (receiveData['message'] ?? '领取失败') : '领取失败';
        Get.snackbar('领取失败', msg.toString(), snackPosition: SnackPosition.TOP);
        return;
      }

      final res = await _api.executeScan({
        'scanCode': scanCode ?? orderId,
        'orderNo': orderNo ?? '',
        'orderId': orderId,
        'scanType': 'quality',
        'qualityStage': 'confirm',
        'qualityResult': defective > 0 ? 'unqualified' : 'qualified',
        'defectQuantity': defective,
        'remark': remark,
        'source': 'flutter',
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
