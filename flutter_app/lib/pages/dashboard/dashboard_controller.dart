import 'package:get/get.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class DashboardController extends GetxController {
  final ApiService _api = Get.find<ApiService>();

  final loading = false.obs;
  final totalOrders = 0.obs;
  final totalWarehoused = 0.obs;
  final totalDefective = 0.obs;
  final totalProcurement = 0.obs;
  final activities = <Map<String, dynamic>>[].obs;

  @override
  void onInit() {
    super.onInit();
    loadData();
  }

  Future<void> loadData() async {
    loading.value = true;
    try {
      final res = await _api.getDashboard();
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] != null) {
        final d = data['data'] as Map<String, dynamic>;
        totalOrders.value = d['totalOrders'] ?? 0;
        totalWarehoused.value = d['totalWarehoused'] ?? 0;
        totalDefective.value = d['totalDefective'] ?? 0;
        totalProcurement.value = d['totalProcurement'] ?? 0;
        final list = d['activities'] as List? ?? [];
        activities.value = list.map((e) => e as Map<String, dynamic>).toList();
      }
    } catch (e) {
      ErrorHandler.handle(e);
    } finally {
      loading.value = false;
    }
  }
}
