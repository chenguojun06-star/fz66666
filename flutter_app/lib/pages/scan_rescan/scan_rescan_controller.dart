import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class ScanRescanController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final qrCode = ''.obs;
  final loading = false.obs;

  Future<void> doRescan(String code) async {
    qrCode.value = code;
    loading.value = true;
    try {
      final res = await _api.rescanApi({'qrCode': code});
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('成功', '重扫已提交', snackPosition: SnackPosition.TOP, backgroundColor: AppColors.success, colorText: Colors.white);
      } else {
        final msg = data is Map ? (data['message'] ?? '重扫失败') : '重扫失败';
        Get.snackbar('失败', msg.toString(), snackPosition: SnackPosition.TOP);
      }
    } catch (e) { ErrorHandler.handle(e); }
    finally { loading.value = false; }
  }
}
