import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class AdminFeedbackController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final content = ''.obs;
  final loading = false.obs;
  final feedbackList = <Map<String, dynamic>>[].obs;

  @override
  void onInit() {
    super.onInit();
    loadFeedbackList();
  }

  Future<void> loadFeedbackList() async {
    try {
      final res = await _api.myFeedbackList();
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final list = data['data'] as List? ?? [];
        feedbackList.value = list.map((e) => e as Map<String, dynamic>).toList();
      }
    } catch (_) {}
  }

  Future<void> submitFeedback() async {
    if (content.value.trim().isEmpty) {
      Get.snackbar('提示', '请输入反馈内容', snackPosition: SnackPosition.TOP);
      return;
    }
    loading.value = true;
    try {
      final res = await _api.submitFeedback({'content': content.value.trim()});
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('成功', '反馈已提交', snackPosition: SnackPosition.TOP, backgroundColor: AppColors.success, colorText: Colors.white);
        content.value = '';
        loadFeedbackList();
      } else {
        final msg = data is Map ? (data['message'] ?? '提交失败') : '提交失败';
        Get.snackbar('失败', msg.toString(), snackPosition: SnackPosition.TOP);
      }
    } catch (e) {
      ErrorHandler.handle(e);
    } finally {
      loading.value = false;
    }
  }
}
