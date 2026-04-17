import 'package:get/get.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class ScanPatternController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final patternId = ''.obs;
  final patternDetail = <String, dynamic>{}.obs;
  final loading = false.obs;

  Future<void> loadPattern(String id) async {
    patternId.value = id;
    loading.value = true;
    try {
      final res = await _api.getPatternDetail(id);
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] != null) {
        patternDetail.value = data['data'] as Map<String, dynamic>;
      }
    } catch (e) { ErrorHandler.handle(e); }
    finally { loading.value = false; }
  }

  Future<void> submitScan(Map<String, dynamic> scanData) async {
    try {
      final res = await _api.submitPatternScan(scanData);
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('成功', '样衣扫码已记录', snackPosition: SnackPosition.TOP);
      }
    } catch (e) { ErrorHandler.handle(e); }
  }
}
