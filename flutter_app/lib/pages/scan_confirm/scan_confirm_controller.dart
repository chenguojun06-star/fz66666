import 'package:get/get.dart';
import 'package:dio/dio.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';
import '../../utils/scan/qr_code_parser.dart';
import '../../routes/app_routes.dart';

class ScanConfirmController extends GetxController {
  final ApiService _api = Get.find<ApiService>();

  final loading = false.obs;
  final orderNo = ''.obs;
  final bundleNo = ''.obs;
  final processName = ''.obs;
  final quantity = ''.obs;
  final details = <SummaryItemData>[].obs;

  final String _qrCode;

  ScanConfirmController() : _qrCode = Get.arguments?['qrCode'] ?? '';

  @override
  void onInit() {
    super.onInit();
    _loadScanInfo();
  }

  Future<void> _loadScanInfo() async {
    if (_qrCode.isEmpty) return;
    loading.value = true;

    final parsed = QRCodeParser.parse(_qrCode);
    orderNo.value = parsed.orderNo ?? '';
    bundleNo.value = parsed.bundleNo ?? '';

    try {
      if (orderNo.value.isNotEmpty) {
        final res = await _api.orderDetail(orderNo.value);
        final data = res.data;
        if (data is Map && data['code'] == 200 && data['data'] != null) {
          final order = data['data'] as Map<String, dynamic>;
          processName.value = order['currentProcessName']?.toString() ?? '';
          quantity.value = order['quantity']?.toString() ?? order['totalQuantity']?.toString() ?? '0';
          details.value = [
            SummaryItemData(key: '款号', value: order['styleNo']?.toString() ?? '-'),
            SummaryItemData(key: '工厂', value: order['factoryName']?.toString() ?? '-'),
            SummaryItemData(key: '进度', value: '${order['productionProgress'] ?? 0}%'),
          ];
        }
      }
    } catch (e) {
      ErrorHandler.handle(e);
    } finally {
      loading.value = false;
    }
  }

  Future<void> confirm() async {
    loading.value = true;
    try {
      final res = await _api.executeScan({
        'qrCode': _qrCode,
        'orderNo': orderNo.value,
        'bundleNo': bundleNo.value,
      });
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('成功', '扫码已确认', snackPosition: SnackPosition.TOP);
        Get.back(result: true);
      } else {
        final msg = data is Map ? (data['message'] ?? '确认失败') : '确认失败';
        Get.snackbar('失败', msg.toString(), snackPosition: SnackPosition.TOP);
      }
    } on DioException catch (e) {
      ErrorHandler.handle(e);
    } finally {
      loading.value = false;
    }
  }
}

class SummaryItemData {
  final String key;
  final String value;
  SummaryItemData({required this.key, required this.value});
}
