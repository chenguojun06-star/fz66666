import 'package:get/get.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class WorkInboxController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final notices = <Map<String, dynamic>>[].obs;
  final loading = false.obs;

  @override
  void onInit() { super.onInit(); loadNotices(); }

  Future<void> loadNotices() async {
    loading.value = true;
    try {
      final res = await _api.myNoticeList();
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final list = data['data'] as List? ?? [];
        notices.value = list.map((e) => e as Map<String, dynamic>).toList();
      }
    } catch (e) { ErrorHandler.handle(e); }
    finally { loading.value = false; }
  }

  Future<void> markRead(String id) async {
    try {
      await _api.markNoticeRead(id);
      final idx = notices.indexWhere((n) => n['id']?.toString() == id);
      if (idx >= 0) notices[idx]['read'] = true;
      notices.refresh();
    } catch (_) {}
  }
}
