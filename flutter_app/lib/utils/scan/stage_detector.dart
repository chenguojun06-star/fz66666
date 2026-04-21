import 'package:get/get.dart';
import '../api_service.dart';

enum ScanStage {
  procurement,
  cutting,
  sewing,
  qualityReceive,
  qualityConfirm,
  warehousing,
  unknown,
}

class StageDetectResult {
  final String processName;
  final String progressStage;
  final String scanType;
  final String hint;
  final double unitPrice;
  final List<String> scannedProcessNames;
  final List<Map<String, dynamic>> allBundleProcesses;
  final bool isCompleted;

  StageDetectResult({
    required this.processName,
    this.progressStage = '',
    this.scanType = 'production',
    this.hint = '',
    this.unitPrice = 0,
    this.scannedProcessNames = const [],
    this.allBundleProcesses = const [],
    this.isCompleted = false,
  });
}

class StageDetector {
  final ApiService _api = Get.find<ApiService>();

  final Map<String, List<Map<String, dynamic>>> _processConfigCache = {};

  Future<StageDetectResult> detectByBundle(
    String orderNo,
    String bundleNo,
    int quantity,
  ) async {
    final config = await _loadProcessConfig(orderNo);
    if (config.isEmpty) {
      return StageDetectResult(processName: '', isCompleted: false);
    }

    final bundleProcesses = config.where((p) {
      final st = (p['scanType'] ?? '').toString().toLowerCase();
      return st != 'procurement' && st != 'cutting';
    }).toList();

    if (bundleProcesses.isEmpty) {
      return StageDetectResult(processName: '', isCompleted: false);
    }

    List<Map<String, dynamic>> scanHistory = [];
    try {
      final res = await _api.getScanHistory(orderNo, bundleNo: bundleNo);
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] != null) {
        final list = data['data'] as List;
        scanHistory = list
            .where((r) =>
                r['scanResult'] == 'success' &&
                r['scanType'] != 'orchestration')
            .map((e) => e as Map<String, dynamic>)
            .toList();
      }
    } catch (_) {}

    final scannedProcessNames = <String>{};
    for (final r in scanHistory) {
      final pn = (r['processName'] ?? '').toString().trim();
      if (pn.isNotEmpty) {
        scannedProcessNames.add(pn);
      }
    }

    final remainingProcesses = bundleProcesses
        .where((p) => !scannedProcessNames
            .contains((p['processName'] ?? '').toString().trim()))
        .toList();

    if (remainingProcesses.isEmpty) {
      return StageDetectResult(
        processName: '',
        isCompleted: true,
        hint: '该菲号所有工序已完成',
        scannedProcessNames: scannedProcessNames.toList(),
        allBundleProcesses: bundleProcesses,
      );
    }

    final nextProcess = remainingProcesses.first;
    final nextProcessName =
        (nextProcess['processName'] ?? '').toString().trim();
    final nextProgressStage =
        (nextProcess['progressStage'] ?? '').toString().trim();
    final nextScanType =
        (nextProcess['scanType'] ?? 'production').toString().trim().toLowerCase();
    final nextUnitPrice =
        (nextProcess['unitPrice'] ?? nextProcess['price'] ?? 0);
    final doneCount = bundleProcesses.length - remainingProcesses.length;

    String scanType = 'production';
    if (nextScanType == 'quality') {
      scanType = 'quality';
    } else if (nextScanType == 'warehouse') {
      scanType = 'warehouse';
    }

    String hint;
    if (bundleProcesses.length > 1) {
      hint = '$nextProcessName (已完成$doneCount/${bundleProcesses.length}道工序)';
    } else {
      hint = nextProcessName;
    }

    return StageDetectResult(
      processName: nextProcessName,
      progressStage: nextProgressStage,
      scanType: scanType,
      hint: hint,
      unitPrice: nextUnitPrice is double
          ? nextUnitPrice
          : double.tryParse(nextUnitPrice.toString()) ?? 0,
      scannedProcessNames: scannedProcessNames.toList(),
      allBundleProcesses: bundleProcesses,
      isCompleted: false,
    );
  }

  Future<List<Map<String, dynamic>>> _loadProcessConfig(String orderNo) async {
    if (_processConfigCache.containsKey(orderNo)) {
      return _processConfigCache[orderNo]!;
    }

    try {
      final res = await _api.getProcessConfig(orderNo);
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] != null) {
        final list =
            (data['data'] as List).map((e) => e as Map<String, dynamic>).toList();
        _processConfigCache[orderNo] = list;
        return list;
      }
    } catch (_) {}
    return [];
  }

  static String stageLabel(ScanStage stage) {
    switch (stage) {
      case ScanStage.procurement:
        return '采购收货';
      case ScanStage.cutting:
        return '裁剪';
      case ScanStage.sewing:
        return '车缝';
      case ScanStage.qualityReceive:
        return '质检领取';
      case ScanStage.qualityConfirm:
        return '质检确认';
      case ScanStage.warehousing:
        return '入库';
      case ScanStage.unknown:
        return '未知工序';
    }
  }

  void clearCache() {
    _processConfigCache.clear();
  }
}
