import 'package:flutter/material.dart' show Color, Colors;
import 'package:get/get.dart';
import '../../utils/api_service.dart';

class ScanController extends GetxController {
  final ApiService _api = Get.find<ApiService>();

  final todayCount = 0.obs;
  final todayCompleted = 0.obs;
  final scanCode = ''.obs;
  final scanning = false.obs;
  final recentScans = <Map<String, dynamic>>[].obs;
  final offlinePendingCount = 0.obs;

  @override
  void onInit() {
    super.onInit();
    _loadStats();
    _loadRecentScans();
  }

  Future<void> _loadStats() async {
    try {
      final res = await _api.personalScanStats();
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] != null) {
        final stats = data['data'];
        todayCount.value = stats['todayCount'] ?? 0;
        todayCompleted.value = stats['todayCompleted'] ?? 0;
      }
    } catch (_) {}
  }

  Future<void> _loadRecentScans() async {
    try {
      final res = await _api.myScanHistory({'pageSize': 20});
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final pageData = data['data'];
        final records = (pageData is Map ? pageData['records'] as List? : null) ?? [];
        recentScans.value = records.map((e) => e as Map<String, dynamic>).toList();
      }
    } catch (_) {}
  }

  Future<void> onScanResult(String code) async {
    scanCode.value = code;
    scanning.value = true;
    try {
      final res = await _api.executeScan({'qrCode': code});
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('扫码成功', '已记录', snackPosition: SnackPosition.TOP, backgroundColor: Get.theme.primaryColor, colorText: Colors.white);
        _loadStats();
        _loadRecentScans();
      } else {
        final msg = data is Map ? (data['message'] ?? '扫码失败') : '扫码失败';
        Get.snackbar('扫码失败', msg.toString(), snackPosition: SnackPosition.TOP);
      }
    } catch (e) {
      Get.snackbar('扫码异常', e.toString(), snackPosition: SnackPosition.TOP);
    } finally {
      scanning.value = false;
    }
  }

  void goToHistory() => Get.toNamed('/scan/history');
  void goToPattern() => Get.toNamed('/scan/pattern');
}
