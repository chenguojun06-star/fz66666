import 'package:get/get.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class PayrollController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final stats = <String, dynamic>{}.obs;
  final details = <Map<String, dynamic>>[].obs;
  final loading = false.obs;

  @override
  void onInit() { super.onInit(); loadPayroll(); }

  Future<void> loadPayroll() async {
    loading.value = true;
    try {
      final res = await _api.personalScanStats();
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] != null) {
        stats.value = data['data'] as Map<String, dynamic>;
      }
    } catch (e) { ErrorHandler.handle(e); }
    finally { loading.value = false; }
  }
}
