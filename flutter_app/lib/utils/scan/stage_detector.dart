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

class StageDetector {
  final ApiService _api = Get.find<ApiService>();

  final Map<String, List<Map<String, dynamic>>> _processConfigCache = {};

  Future<ScanStage> detectStage(String orderNo, String qrCode, {int currentScanCount = 0}) async {
    final config = await _loadProcessConfig(orderNo);

    if (config.isEmpty) {
      return _inferFromScanCount(currentScanCount);
    }

    for (final process in config) {
      final name = (process['processName'] ?? '').toString().toLowerCase();
      final scanCount = process['expectedScanCount'] as int? ?? 0;

      if (currentScanCount <= scanCount) {
        if (name.contains('采购') || name.contains('purchase')) {
          return ScanStage.procurement;
        } else if (name.contains('裁剪') || name.contains('cutting')) {
          return ScanStage.cutting;
        } else if (name.contains('车缝') || name.contains('sewing') || name.contains('缝制')) {
          return ScanStage.sewing;
        } else if (name.contains('质检') || name.contains('quality') || name.contains('检验')) {
          if (currentScanCount < scanCount) {
            return ScanStage.qualityReceive;
          }
          return ScanStage.qualityConfirm;
        } else if (name.contains('入库') || name.contains('warehousing') || name.contains('包装')) {
          return ScanStage.warehousing;
        }
      }
    }

    return ScanStage.unknown;
  }

  Future<List<Map<String, dynamic>>> _loadProcessConfig(String orderNo) async {
    if (_processConfigCache.containsKey(orderNo)) {
      return _processConfigCache[orderNo]!;
    }

    try {
      final res = await _api.getProcessConfig(orderNo);
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] != null) {
        final list = (data['data'] as List).map((e) => e as Map<String, dynamic>).toList();
        _processConfigCache[orderNo] = list;
        return list;
      }
    } catch (_) {}
    return [];
  }

  ScanStage _inferFromScanCount(int count) {
    if (count == 0) return ScanStage.procurement;
    if (count == 1) return ScanStage.cutting;
    if (count == 2) return ScanStage.sewing;
    if (count == 3) return ScanStage.qualityReceive;
    if (count == 4) return ScanStage.qualityConfirm;
    if (count >= 5) return ScanStage.warehousing;
    return ScanStage.unknown;
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
