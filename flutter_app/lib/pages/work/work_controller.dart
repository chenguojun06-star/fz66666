import 'package:get/get.dart';
import '../../utils/api_service.dart';

class WorkController extends GetxController {
  final ApiService _api = Get.find<ApiService>();

  final activeTab = 'all'.obs;
  final orders = <Map<String, dynamic>>[].obs;
  final loading = false.obs;
  final page = 1.obs;
  final hasMore = true.obs;
  final searchKeyword = ''.obs;
  final searchResults = <Map<String, dynamic>>[].obs;
  final hasSearched = false.obs;

  final tabs = [
    {'key': 'all', 'label': '全部'},
    {'key': 'procurement', 'label': '采购'},
    {'key': 'cutting', 'label': '裁剪'},
    {'key': 'sewing', 'label': '车缝'},
    {'key': 'warehousing', 'label': '入库'},
  ];

  @override
  void onInit() {
    super.onInit();
    loadOrders(reset: true);
  }

  void onTab(String tab) {
    activeTab.value = tab;
    loadOrders(reset: true);
  }

  Future<void> loadOrders({bool reset = false}) async {
    if (loading.value) return;
    if (!reset && !hasMore.value) return;

    loading.value = true;
    if (reset) {
      page.value = 1;
      hasMore.value = true;
    }

    try {
      final params = <String, dynamic>{
        'page': page.value,
        'pageSize': 10,
      };
      if (activeTab.value != 'all') {
        params['processStage'] = activeTab.value;
      }

      final res = await _api.listOrders(params);
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final pageData = data['data'];
        final records = (pageData is Map ? pageData['records'] as List? : null) ?? [];
        final newOrders = records.map((e) => e as Map<String, dynamic>).toList();

        if (reset) {
          orders.value = newOrders;
        } else {
          orders.addAll(newOrders);
        }
        final total = pageData is Map ? (pageData['total'] ?? 0) : 0;
        hasMore.value = orders.length < total;
        page.value++;
      }
    } catch (_) {}
    loading.value = false;
  }

  Future<void> doSearch(String keyword) async {
    if (keyword.isEmpty) return;
    searchKeyword.value = keyword;
    hasSearched.value = true;
    try {
      final res = await _api.listOrders({'orderNo': keyword, 'pageSize': 20});
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final pageData = data['data'];
        final records = (pageData is Map ? pageData['records'] as List? : null) ?? [];
        searchResults.value = records.map((e) => e as Map<String, dynamic>).toList();
      }
    } catch (_) {}
  }

  void clearSearch() {
    searchKeyword.value = '';
    searchResults.clear();
    hasSearched.value = false;
  }
}
