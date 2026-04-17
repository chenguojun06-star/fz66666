import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../theme/app_colors.dart';
import '../../utils/api_service.dart';
import '../../utils/scan/qr_code_parser.dart';
import '../../utils/scan/scan_offline_queue.dart';
import '../../routes/app_routes.dart';

class ScanController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final ScanOfflineQueue _offlineQueue = ScanOfflineQueue();

  final todayCount = 0.obs;
  final todayCompleted = 0.obs;
  final scanCode = ''.obs;
  final scanning = false.obs;
  final recentScans = <Map<String, dynamic>>[].obs;
  final scannerAvailable = true.obs;
  final scannerInitialized = false.obs;
  Widget scannerWidget = const SizedBox.shrink();

  final MobileScannerController _scannerController = MobileScannerController();

  @override
  void onInit() {
    super.onInit();
    _initScanner();
    _loadStats();
    _loadRecentScans();
  }

  Future<void> _initScanner() async {
    try {
      scannerWidget = MobileScanner(
        controller: _scannerController,
        onDetect: (capture) {
          final barcode = capture.barcodes.firstOrNull;
          if (barcode != null && barcode.rawValue != null) {
            onScanResult(barcode.rawValue!);
          }
        },
      );
      scannerInitialized.value = true;
      scannerAvailable.value = true;
    } catch (e) {
      scannerAvailable.value = false;
    }
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
    if (scanning.value) return;
    scanCode.value = code;
    scanning.value = true;

    final parsed = QRCodeParser.parse(code);

    try {
      final res = await _api.executeScan({
        'qrCode': code,
        'orderNo': parsed.orderNo,
        'bundleNo': parsed.bundleNo,
        'type': parsed.type.name,
      });
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('扫码成功', '${parsed.displayName} 已记录', snackPosition: SnackPosition.TOP, backgroundColor: AppColors.primary, colorText: Colors.white);
        _loadStats();
        _loadRecentScans();
      } else {
        final msg = data is Map ? (data['message'] ?? '扫码失败') : '扫码失败';
        Get.snackbar('扫码失败', msg.toString(), snackPosition: SnackPosition.TOP);
      }
    } catch (e) {
      await _offlineQueue.enqueue(code, {
        'qrCode': code,
        'orderNo': parsed.orderNo,
        'bundleNo': parsed.bundleNo,
        'type': parsed.type.name,
      });
      Get.snackbar('离线保存', '网络异常，扫码已保存到本地', snackPosition: SnackPosition.TOP, backgroundColor: AppColors.warning, colorText: Colors.white);
    } finally {
      scanning.value = false;
    }
  }

  void onManualInput() {
    final inputController = TextEditingController();
    Get.dialog(
      AlertDialog(
        title: const Text('手动输入编码'),
        content: TextField(
          controller: inputController,
          autofocus: true,
          decoration: const InputDecoration(hintText: '请输入条码/二维码内容'),
        ),
        actions: [
          TextButton(onPressed: () => Get.back(), child: const Text('取消')),
          ElevatedButton(
            onPressed: () {
              final code = inputController.text.trim();
              if (code.isNotEmpty) {
                Get.back();
                onScanResult(code);
              }
            },
            child: const Text('确认'),
          ),
        ],
      ),
    );
  }

  void goToHistory() => Get.toNamed(AppRoutes.scanHistory);
  void goToPattern() => Get.toNamed(AppRoutes.scanPattern);

  @override
  void onClose() {
    _scannerController.dispose();
    super.onClose();
  }
}
