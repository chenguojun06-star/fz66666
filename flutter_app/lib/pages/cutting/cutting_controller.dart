import 'package:get/get.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class CuttingController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final tasks = <Map<String, dynamic>>[].obs;
  final loading = false.obs;

  @override
  void onInit() { super.onInit(); loadTasks(); }

  Future<void> loadTasks() async {
    loading.value = true;
    try {
      final res = await _api.myCuttingTasks();
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final list = data['data'] as List? ?? [];
        tasks.value = list.map((e) => e as Map<String, dynamic>).toList();
      }
    } catch (e) { ErrorHandler.handle(e); }
    finally { loading.value = false; }
  }
}
