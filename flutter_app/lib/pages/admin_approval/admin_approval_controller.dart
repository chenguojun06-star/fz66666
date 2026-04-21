import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class AdminApprovalController extends GetxController {
  final ApiService _api = Get.find<ApiService>();

  final pendingUsers = <Map<String, dynamic>>[].obs;
  final loading = false.obs;

  @override
  void onInit() {
    super.onInit();
    loadPendingUsers();
  }

  Future<void> loadPendingUsers() async {
    loading.value = true;
    try {
      final res = await _api.listPendingUsers();
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final list = data['data'] as List? ?? [];
        pendingUsers.value = list.map((e) => e as Map<String, dynamic>).toList();
      }
    } catch (e) {
      ErrorHandler.handle(e);
    } finally {
      loading.value = false;
    }
  }

  Future<void> approveUser(String userId) async {
    try {
      final res = await _api.approveUser(userId);
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('成功', '已通过审批', snackPosition: SnackPosition.TOP, backgroundColor: AppColors.success, colorText: Colors.white);
        pendingUsers.removeWhere((u) => u['id']?.toString() == userId);
      } else {
        final msg = data is Map ? (data['message'] ?? '操作失败') : '操作失败';
        Get.snackbar('失败', msg.toString(), snackPosition: SnackPosition.TOP);
      }
    } catch (e) {
      ErrorHandler.handle(e);
    }
  }

  Future<void> rejectUser(String userId) async {
    try {
      final res = await _api.rejectUser(userId);
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('已拒绝', '审批已拒绝', snackPosition: SnackPosition.TOP);
        pendingUsers.removeWhere((u) => u['id']?.toString() == userId);
      }
    } catch (e) {
      ErrorHandler.handle(e);
    }
  }

  void confirmReject(String userId) {
    Get.dialog(AlertDialog(
      title: const Text('确认拒绝'),
      content: const Text('确定要拒绝该用户的注册申请吗？'),
      actions: [
        TextButton(onPressed: () => Get.back(), child: const Text('取消')),
        ElevatedButton(
          style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
          onPressed: () { Get.back(); rejectUser(userId); },
          child: const Text('确认拒绝'),
        ),
      ],
    ));
  }
}
