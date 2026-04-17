import 'package:get/get.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class ScanHistoryController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final records = <Map<String, dynamic>>[].obs;
  final loading = false.obs;
  final page = 1.obs;
  final hasMore = true.obs;

  @override
  void onInit() {
    super.onInit();
    loadRecords(reset: true);
  }

  Future<void> loadRecords({bool reset = false}) async {
    if (loading.value) return;
    if (!reset && !hasMore.value) return;
    loading.value = true;
    if (reset) { page.value = 1; hasMore.value = true; }

    try {
      final res = await _api.myScanHistory({'page': page.value, 'pageSize': 20});
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final pageData = data['data'];
        final list = (pageData is Map ? pageData['records'] as List? : null) ?? [];
        final newRecords = list.map((e) => e as Map<String, dynamic>).toList();
        if (reset) { records.value = newRecords; } else { records.addAll(newRecords); }
        final total = pageData is Map ? (pageData['total'] ?? 0) : 0;
        hasMore.value = records.length < total;
        page.value++;
      }
    } catch (e) {
      ErrorHandler.handle(e);
    } finally {
      loading.value = false;
    }
  }
}
