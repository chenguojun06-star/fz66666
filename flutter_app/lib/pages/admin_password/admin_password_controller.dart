import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class AdminPasswordController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final oldPassword = ''.obs;
  final newPassword = ''.obs;
  final confirmPassword = ''.obs;
  final loading = false.obs;

  Future<void> changePassword() async {
    if (oldPassword.value.isEmpty || newPassword.value.isEmpty) {
      Get.snackbar('提示', '请填写完整信息', snackPosition: SnackPosition.TOP);
      return;
    }
    if (newPassword.value != confirmPassword.value) {
      Get.snackbar('提示', '两次密码不一致', snackPosition: SnackPosition.TOP);
      return;
    }
    if (newPassword.value.length < 6) {
      Get.snackbar('提示', '密码至少6位', snackPosition: SnackPosition.TOP);
      return;
    }
    loading.value = true;
    try {
      final res = await _api.changePassword({
        'oldPassword': oldPassword.value,
        'newPassword': newPassword.value,
      });
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('成功', '密码已修改', snackPosition: SnackPosition.TOP, backgroundColor: AppColors.success, colorText: Colors.white);
        Get.back();
      } else {
        final msg = data is Map ? (data['message'] ?? '修改失败') : '修改失败';
        Get.snackbar('失败', msg.toString(), snackPosition: SnackPosition.TOP);
      }
    } catch (e) {
      ErrorHandler.handle(e);
    } finally {
      loading.value = false;
    }
  }
}
