import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../theme/app_colors.dart';
import '../../utils/api_service.dart';
import '../../utils/storage_service.dart';
import '../../utils/permission_service.dart';
import '../../utils/scan/qr_code_parser.dart';
import '../../utils/scan/scan_offline_queue.dart';
import '../../utils/event_bus.dart';
import '../../routes/app_routes.dart';

class ScanController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final StorageService _storage = Get.find<StorageService>();
  final ScanOfflineQueue _offlineQueue = ScanOfflineQueue();

  final todayCount = 0.obs;
  final todayCompleted = 0.obs;
  final scanCode = ''.obs;
  final scanning = false.obs;
  final recentScans = <Map<String, dynamic>>[].obs;
  final scannerAvailable = true.obs;
  final scannerInitialized = false.obs;
  Widget scannerWidget = const SizedBox.shrink();

  final selectedScanType = ScanType.production.obs;
  final offlineCount = 0.obs;
  final lastScanResult = <String, dynamic>{}.obs;
  final lastScanRecord = Rx<Map<String, dynamic>?>(null);
  final pendingQualityTasks = 0.obs;
  final pendingRepairTasks = 0.obs;

  final MobileScannerController _scannerController = MobileScannerController();

  List<ScanType> get allowedScanTypes {
    final permission = PermissionService();
    return permission.getAllowedScanTypes();
  }

  static String _normalizeScanType(ScanType type) {
    switch (type) {
      case ScanType.cutting:
        return 'cutting';
      case ScanType.production:
        return 'production';
      case ScanType.quality:
        return 'quality';
      case ScanType.warehouse:
        return 'warehouse';
      case ScanType.sample:
        return 'pattern';
    }
  }

  @override
  void onInit() {
    super.onInit();
    _restoreScanType();
    _initScanner();
    _loadStats();
    _loadRecentScans();
    _loadOfflineCount();
    _loadPendingTasks();
    _bindWsEvents();
  }

  void _restoreScanType() {
    final saved = _storage.getValue('mp_scan_type_index', 0);
    final types = allowedScanTypes;
    if (saved < types.length) {
      selectedScanType.value = types[saved];
    }
  }

  void _bindWsEvents() {
    EventBus.instance.on(EventBus.scanSuccess, (data) {
      _loadStats();
      _loadRecentScans();
    }, tag: 'ScanController');
    EventBus.instance.on(EventBus.dataChanged, (data) {
      _loadStats();
      _loadOfflineCount();
    }, tag: 'ScanController');
    EventBus.instance.on(EventBus.taskReminder, (data) {
      _loadPendingTasks();
    }, tag: 'ScanController');
  }

  @override
  void onClose() {
    _scannerController.dispose();
    EventBus.instance.off(EventBus.scanSuccess, tag: 'ScanController');
    EventBus.instance.off(EventBus.dataChanged, tag: 'ScanController');
    EventBus.instance.off(EventBus.taskReminder, tag: 'ScanController');
    super.onClose();
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

  Future<void> _loadOfflineCount() async {
    try {
      offlineCount.value = await _offlineQueue.getPendingCount();
    } catch (_) {}
  }

  Future<void> _loadPendingTasks() async {
    try {
      final qualityRes = await _api.myQualityTasks();
      final qualityData = qualityRes.data;
      if (qualityData is Map && qualityData['code'] == 200 && qualityData['data'] != null) {
        final list = qualityData['data'];
        if (list is List) {
          pendingQualityTasks.value = list.length;
        }
      }
    } catch (_) {}

    try {
      final repairRes = await _api.myRepairTasks();
      final repairData = repairRes.data;
      if (repairData is Map && repairData['code'] == 200 && repairData['data'] != null) {
        final list = repairData['data'];
        if (list is List) {
          pendingRepairTasks.value = list.length;
        }
      }
    } catch (_) {}
  }

  void onScanTypeChanged(ScanType type) {
    selectedScanType.value = type;
    final idx = allowedScanTypes.indexOf(type);
    if (idx >= 0) {
      _storage.setValue('mp_scan_type_index', idx);
    }
  }

  Future<void> onScanResult(String code) async {
    if (scanning.value) return;

    if (selectedScanType.value == ScanType.sample) {
      scanning.value = false;
      Get.snackbar('提示', '样衣扫码请使用样衣扫码页面', snackPosition: SnackPosition.BOTTOM);
      return;
    }

    scanCode.value = code;
    scanning.value = true;

    final parsed = QRCodeParser.parse(code);

    try {
      final userInfo = _storage.getUserInfo();
      final res = await _api.executeScan({
        'scanCode': code,
        'orderNo': parsed.orderNo,
        'bundleNo': parsed.bundleNo,
        'scanType': _normalizeScanType(selectedScanType.value),
        'processName': parsed.processName,
        'processCode': parsed.processCode,
        'progressStage': parsed.progressStage ?? '',
        'quantity': parsed.quantity,
        'styleNo': parsed.styleNo,
        'color': parsed.color,
        'size': parsed.size,
        'source': 'flutter',
        'operatorId': userInfo?['id']?.toString() ?? '',
        'operatorName': userInfo?['username']?.toString() ?? '',
        'requestId': 'flutter_${DateTime.now().millisecondsSinceEpoch}_${code.hashCode.abs()}',
      });
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        lastScanResult.value = data['data'] is Map ? data['data'] as Map<String, dynamic> : {'qrCode': code};
        lastScanRecord.value = {
          'orderNo': parsed.orderNo ?? data['data']?['orderNo'] ?? '',
          'processCode': parsed.processCode ?? '',
          'processName': parsed.processName ?? data['data']?['processName'] ?? '',
          'quantity': parsed.quantity ?? data['data']?['quantity'] ?? 0,
          'success': true,
        };
        Get.snackbar('扫码成功', '${parsed.displayName} 已记录',
          snackPosition: SnackPosition.TOP,
          backgroundColor: AppColors.success,
          colorText: Colors.white,
          duration: const Duration(seconds: 2));
        _loadStats();
        _loadRecentScans();
        _tryUploadOffline();
      } else {
        final msg = data is Map ? (data['message'] ?? '扫码失败') : '扫码失败';
        lastScanRecord.value = {
          'orderNo': parsed.orderNo ?? '',
          'processCode': parsed.processCode ?? '',
          'processName': parsed.processName ?? '',
          'quantity': parsed.quantity ?? 0,
          'success': false,
        };
        Get.snackbar('扫码失败', msg.toString(),
          snackPosition: SnackPosition.TOP,
          backgroundColor: AppColors.error,
          colorText: Colors.white);
      }
    } catch (e) {
      await _offlineQueue.enqueue(code, {
        'scanCode': code,
        'orderNo': parsed.orderNo,
        'bundleNo': parsed.bundleNo,
        'scanType': _normalizeScanType(selectedScanType.value),
        'processName': parsed.processName,
        'processCode': parsed.processCode,
        'quantity': parsed.quantity,
        'styleNo': parsed.styleNo,
        'color': parsed.color,
        'size': parsed.size,
        'source': 'flutter',
      });
      lastScanRecord.value = {
        'orderNo': parsed.orderNo ?? '',
        'processCode': parsed.processCode ?? '',
        'processName': parsed.processName ?? '',
        'quantity': parsed.quantity ?? 0,
        'success': false,
      };
      _loadOfflineCount();
      Get.snackbar('离线保存', '网络异常，扫码已保存到本地（${offlineCount.value + 1}条待上传）',
        snackPosition: SnackPosition.TOP,
        backgroundColor: AppColors.warning,
        colorText: Colors.white,
        duration: const Duration(seconds: 3));
    } finally {
      scanning.value = false;
    }
  }

  Future<void> _tryUploadOffline() async {
    try {
      await _offlineQueue.uploadAll();
      _loadOfflineCount();
    } catch (_) {}
  }

  Future<void> undoLastScan() async {
    if (recentScans.isEmpty) return;
    final lastScan = recentScans.first;
    final scanId = lastScan['id']?.toString();
    if (scanId == null) return;

    try {
      final res = await _api.undoScan({'recordId': scanId});
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('撤销成功', '已撤销上次扫码',
          snackPosition: SnackPosition.TOP,
          backgroundColor: AppColors.success,
          colorText: Colors.white);
        _loadStats();
        _loadRecentScans();
      } else {
        final msg = data is Map ? (data['message'] ?? '撤销失败') : '撤销失败';
        Get.snackbar('撤销失败', msg.toString(),
          snackPosition: SnackPosition.TOP,
          backgroundColor: AppColors.error,
          colorText: Colors.white);
      }
    } catch (_) {
      Get.snackbar('撤销失败', '网络异常',
        snackPosition: SnackPosition.TOP,
        backgroundColor: AppColors.error,
        colorText: Colors.white);
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
  void goToQuality() => Get.toNamed(AppRoutes.scanQuality);
}
