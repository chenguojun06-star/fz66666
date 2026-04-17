import 'dart:async';
import 'package:get/get.dart';
import '../../utils/api_service.dart';
import '../../utils/storage_service.dart';
import '../../utils/event_bus.dart';

class WorkController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final StorageService _storage = Get.find<StorageService>();

  final activeTab = 'all'.obs;
  final orders = <Map<String, dynamic>>[].obs;
  final loading = false.obs;
  final page = 1.obs;
  final hasMore = true.obs;
  final searchKeyword = ''.obs;
  final searchResults = <Map<String, dynamic>>[].obs;
  final hasSearched = false.obs;

  final factories = <Map<String, dynamic>>[].obs;
  final selectedFactoryId = ''.obs;
  final showOverdueOnly = false.obs;
  final expandedOrderId = ''.obs;
  final orderBundles = <String, List<Map<String, dynamic>>>{}.obs;
  final loadingBundles = false.obs;

  Timer? _searchDebounce;

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
    _loadFactories();
    loadOrders(reset: true);
    _bindWsEvents();
    _restoreActiveTab();
  }

  void _restoreActiveTab() {
    final saved = _storage.getValue('work_active_tab', '');
    if (saved.isNotEmpty) {
      activeTab.value = saved;
      _storage.remove('work_active_tab');
    }
  }

  void _bindWsEvents() {
    EventBus.instance.on(EventBus.orderProgressChanged, (data) {
      loadOrders(reset: true);
    }, tag: 'WorkController');
    EventBus.instance.on(EventBus.dataChanged, (data) {
      loadOrders(reset: true);
    }, tag: 'WorkController');
    EventBus.instance.on(EventBus.warehousingNotify, (data) {
      loadOrders(reset: true);
    }, tag: 'WorkController');
  }

  @override
  void onClose() {
    _searchDebounce?.cancel();
    EventBus.instance.off(EventBus.orderProgressChanged, tag: 'WorkController');
    EventBus.instance.off(EventBus.dataChanged, tag: 'WorkController');
    EventBus.instance.off(EventBus.warehousingNotify, tag: 'WorkController');
    super.onClose();
  }

  Future<void> _loadFactories() async {
    try {
      final res = await _api.listFactories();
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] != null) {
        final list = data['data'];
        if (list is List) {
          factories.value = list.map((e) => e as Map<String, dynamic>).toList();
        }
      }
    } catch (_) {}
  }

  void onTab(String tab) {
    activeTab.value = tab;
    loadOrders(reset: true);
  }

  void onFactoryFilter(String factoryId) {
    selectedFactoryId.value = factoryId;
    loadOrders(reset: true);
  }

  void toggleOverdueFilter() {
    showOverdueOnly.value = !showOverdueOnly.value;
    loadOrders(reset: true);
  }

  void toggleOrderExpand(String orderId) {
    if (expandedOrderId.value == orderId) {
      expandedOrderId.value = '';
    } else {
      expandedOrderId.value = orderId;
      _loadBundles(orderId);
    }
  }

  Future<void> _loadBundles(String orderId) async {
    loadingBundles.value = true;
    try {
      final order = orders.firstWhere(
        (o) => o['id']?.toString() == orderId,
        orElse: () => <String, dynamic>{},
      );
      final orderNo = order['orderNo']?.toString() ?? '';
      if (orderNo.isEmpty) return;

      final res = await _api.listBundles(orderNo);
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] != null) {
        final list = data['data'];
        if (list is List) {
          orderBundles[orderId] = list.map((e) => e as Map<String, dynamic>).toList();
        }
      }
    } catch (_) {}
    loadingBundles.value = false;
  }

  Map<String, dynamic> _enrichOrder(Map<String, dynamic> order) {
    final completed = int.tryParse(order['completedQuantity']?.toString() ?? '0') ?? 0;
    final total = int.tryParse(
          order['cuttingQuantity']?.toString() ??
          order['cuttingQty']?.toString() ??
          order['orderQuantity']?.toString() ??
          order['sizeTotal']?.toString() ?? '0',
        ) ?? 0;
    final remain = total - completed;
    final progress = total > 0 ? ((completed / total) * 100).round().clamp(0, 100) : 0;

    final deliveryDate = order['deliveryDate']?.toString() ?? '';
    String remainDaysText = '';
    String remainDaysClass = '';
    if (deliveryDate.isNotEmpty) {
      try {
        final delivery = DateTime.parse(deliveryDate);
        final diff = delivery.difference(DateTime.now()).inDays;
        if (diff < 0) {
          remainDaysText = '已延期${-diff}天';
          remainDaysClass = 'days-overdue';
        } else if (diff == 0) {
          remainDaysText = '今日交期';
          remainDaysClass = 'days-today';
        } else if (diff <= 3) {
          remainDaysText = '剩余${diff}天';
          remainDaysClass = 'days-soon';
        } else {
          remainDaysText = '剩余${diff}天';
          remainDaysClass = 'days-normal';
        }
      } catch (_) {}
    }

    final processNodes = _buildProcessNodes(order);

    return {
      ...order,
      'remainQuantity': remain.clamp(0, remain),
      'calculatedProgress': progress,
      'remainDaysText': remainDaysText,
      'remainDaysClass': remainDaysClass,
      'processNodes': processNodes,
    };
  }

  List<Map<String, dynamic>> _buildProcessNodes(Map<String, dynamic> order) {
    final nodes = <Map<String, dynamic>>[];
    final stages = [
      {'name': '采购', 'field': 'procurementQuantity', 'completedField': 'procurementCompleted'},
      {'name': '裁剪', 'field': 'cuttingQuantity', 'completedField': 'cuttingCompleted'},
      {'name': '车缝', 'field': 'sewingQuantity', 'completedField': 'sewingCompleted'},
      {'name': '质检', 'field': 'qualityQuantity', 'completedField': 'qualityCompleted'},
      {'name': '入库', 'field': 'warehousingQuantity', 'completedField': 'warehousedQuantity'},
    ];

    for (final stage in stages) {
      final total = int.tryParse(order[stage['field']]?.toString() ?? '0') ?? 0;
      if (total > 0) {
        final completed = int.tryParse(order[stage['completedField']]?.toString() ?? '0') ?? 0;
        final pct = ((completed / total) * 100).round().clamp(0, 100);
        nodes.add({'name': stage['name'], 'percent': pct, 'completed': completed, 'total': total});
      }
    }

    if (nodes.isEmpty) {
      final total = int.tryParse(order['orderQuantity']?.toString() ?? '0') ?? 0;
      final completed = int.tryParse(order['completedQuantity']?.toString() ?? '0') ?? 0;
      final pct = total > 0 ? ((completed / total) * 100).round().clamp(0, 100) : 0;
      nodes.add({'name': '总进度', 'percent': pct, 'completed': completed, 'total': total});
    }

    return nodes;
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
      if (selectedFactoryId.value.isNotEmpty) {
        params['factoryId'] = selectedFactoryId.value;
      }
      if (showOverdueOnly.value) {
        params['overdue'] = 'true';
      }

      final res = await _api.listOrders(params);
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final pageData = data['data'];
        final records = (pageData is Map ? pageData['records'] as List? : null) ?? [];
        final newOrders = records.map((e) => _enrichOrder(e as Map<String, dynamic>)).toList();

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

  void onSearchChanged(String keyword) {
    _searchDebounce?.cancel();
    if (keyword.isEmpty) {
      clearSearch();
      return;
    }
    _searchDebounce = Timer(const Duration(milliseconds: 500), () {
      doSearch(keyword);
    });
  }

  Future<void> doSearch(String keyword) async {
    if (keyword.isEmpty) return;
    searchKeyword.value = keyword;
    hasSearched.value = true;
    try {
      final params = <String, dynamic>{'pageSize': 20};
      if (keyword.contains('-') || keyword.startsWith('ORD')) {
        params['orderNo'] = keyword;
      } else {
        params['styleNo'] = keyword;
      }
      final res = await _api.listOrders(params);
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final pageData = data['data'];
        final records = (pageData is Map ? pageData['records'] as List? : null) ?? [];
        searchResults.value = records.map((e) => _enrichOrder(e as Map<String, dynamic>)).toList();
      }
    } catch (_) {}
  }

  void clearSearch() {
    searchKeyword.value = '';
    searchResults.clear();
    hasSearched.value = false;
  }

  Future<void> onBundleAction(String action, Map<String, dynamic> bundle) async {
    try {
      switch (action) {
        case 'split':
          final bundleId = bundle['id']?.toString() ?? '';
          Get.toNamed('/work/bundle-split', arguments: {'bundleId': bundleId});
          break;
        case 'rollback':
          final res = await _api.rollbackByBundle({
            'bundleNo': bundle['bundleNo'] ?? '',
            'orderNo': bundle['orderNo'] ?? '',
          });
          final data = res.data;
          if (data is Map && data['code'] == 200) {
            Get.snackbar('操作成功', '菲号已回退', snackPosition: SnackPosition.TOP);
            final orderId = expandedOrderId.value;
            if (orderId.isNotEmpty) {
              _loadBundles(orderId);
            }
            loadOrders(reset: true);
          } else {
            final msg = data is Map ? (data['message'] ?? '操作失败') : '操作失败';
            Get.snackbar('操作失败', msg.toString(), snackPosition: SnackPosition.TOP);
          }
          break;
      }
    } catch (_) {
      Get.snackbar('操作失败', '网络异常', snackPosition: SnackPosition.TOP);
    }
  }
}
