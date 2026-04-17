import 'package:get/get.dart';
import '../../utils/api_service.dart';
import '../../utils/storage_service.dart';
import '../../utils/event_bus.dart';
import '../../utils/error_handler.dart';

class DashboardController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final StorageService _storage = Get.find<StorageService>();

  final loading = false.obs;
  final todayStr = ''.obs;
  final todayScanCount = 0.obs;

  final cards = <String, dynamic>{
    'sample': {'developing': 0, 'completed': 0},
    'production': {'total': 0, 'overdue': 0, 'pieces': 0},
    'inbound': {'today': 0, 'week': 0},
    'outbound': {'today': 0, 'week': 0},
  }.obs;

  final statFilters = [
    {'key': 'all', 'label': '全部', 'value': ''},
    {'key': 'in_production', 'label': '生产中', 'value': 'production'},
    {'key': 'completed', 'label': '已完成', 'value': 'completed'},
    {'key': 'overdue', 'label': '延期', 'value': ''},
  ];

  final activeFilter = 'all'.obs;
  final statCounts = <String, int>{'all': 0, 'in_production': 0, 'completed': 0, 'overdue': 0}.obs;
  final searchKey = ''.obs;

  final orders = <Map<String, dynamic>>[].obs;
  final orderPage = 1.obs;
  final orderLoading = false.obs;
  final orderHasMore = true.obs;
  final expandedOrderId = ''.obs;

  @override
  void onInit() {
    super.onInit();
    todayStr.value = _formatToday();
    refreshCards();
    loadOrders(reset: true);
    _bindWsEvents();
  }

  void _bindWsEvents() {
    EventBus.instance.on(EventBus.orderProgressChanged, (data) {
      refreshCards();
      loadOrders(reset: true);
    }, tag: 'DashboardController');
    EventBus.instance.on(EventBus.dataChanged, (data) {
      refreshCards();
    }, tag: 'DashboardController');
    EventBus.instance.on(EventBus.warehousingNotify, (data) {
      refreshCards();
    }, tag: 'DashboardController');
  }

  @override
  void onClose() {
    EventBus.instance.off(EventBus.orderProgressChanged, tag: 'DashboardController');
    EventBus.instance.off(EventBus.dataChanged, tag: 'DashboardController');
    EventBus.instance.off(EventBus.warehousingNotify, tag: 'DashboardController');
    super.onClose();
  }

  String _formatToday() {
    final now = DateTime.now();
    return '${now.year}/${now.month.toString().padLeft(2, '0')}/${now.day.toString().padLeft(2, '0')}';
  }

  Future<void> refreshCards() async {
    loading.value = true;
    int failCount = 0;
    try {
      final results = await Future.wait([
        _api.getDashboard().catchError((e) { failCount++; return Future.value(null); }),
        _api.getTopStats().catchError((e) { failCount++; return Future.value(null); }),
        _api.listOrders({'deleteFlag': 0, 'status': 'production', 'page': 1, 'pageSize': 50}).catchError((e) { failCount++; return Future.value(null); }),
        _api.listOrders({'deleteFlag': 0, 'status': 'completed', 'page': 1, 'pageSize': 1}).catchError((e) { failCount++; return Future.value(null); }),
      ]);

      final dash = _extractData(results[0]);
      final topStats = _extractData(results[1]);
      final prodRes = _extractData(results[2]);
      final compRes = _extractData(results[3]);

      final prodRecords = (prodRes['records'] as List?) ?? [];

      cards.value = {
        'sample': {
          'developing': int.tryParse(dash['sampleDevelopmentCount']?.toString() ?? '0') ?? 0,
          'completed': compRes['total'] ?? 0,
        },
        'production': {
          'total': prodRes['total'] ?? 0,
          'overdue': int.tryParse(dash['overdueOrderCount']?.toString() ?? '0') ?? 0,
          'pieces': 0, // 暂时设为0，修复类型错误
        },
        'inbound': {
          'today': (topStats['warehousingInbound'] is Map ? topStats['warehousingInbound']['day'] : 0) ?? 0,
          'week': (topStats['warehousingInbound'] is Map ? topStats['warehousingInbound']['week'] : 0) ?? 0,
        },
        'outbound': {
          'today': (topStats['warehousingOutbound'] is Map ? topStats['warehousingOutbound']['day'] : 0) ?? 0,
          'week': (topStats['warehousingOutbound'] is Map ? topStats['warehousingOutbound']['week'] : 0) ?? 0,
        },
      };

      todayScanCount.value = int.tryParse(dash['todayScanCount']?.toString() ?? '0') ?? 0;
      _refreshStatCounts();
    } catch (e) {
      ErrorHandler.handle(e, showSnackbar: false);
    }
    loading.value = false;
  }

  Map<String, dynamic> _extractData(dynamic response) {
    try {
      if (response == null) return {};
      final res = response as dynamic;
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] != null) {
        return Map<String, dynamic>.from(data['data'] as Map);
      }
      if (data is Map) return Map<String, dynamic>.from(data);
    } catch (_) {}
    return {};
  }

  Future<void> _refreshStatCounts() async {
    try {
      final results = await Future.wait([
        _api.listOrders({'deleteFlag': 0, 'page': 1, 'pageSize': 1}).catchError((_) => Future.value(null)),
        _api.listOrders({'deleteFlag': 0, 'status': 'production', 'page': 1, 'pageSize': 1}).catchError((_) => Future.value(null)),
        _api.listOrders({'deleteFlag': 0, 'status': 'completed', 'page': 1, 'pageSize': 1}).catchError((_) => Future.value(null)),
        _api.getDashboard().catchError((_) => Future.value(null)),
      ]);

      statCounts.value = {
        'all': _extractData(results[0])['total'] ?? 0,
        'in_production': _extractData(results[1])['total'] ?? 0,
        'completed': _extractData(results[2])['total'] ?? 0,
        'overdue': int.tryParse(_extractData(results[3])['overdueOrderCount']?.toString() ?? '0') ?? 0,
      };
    } catch (_) {}
  }

  void onFilterTap(String key) {
    if (key == activeFilter.value) return;
    activeFilter.value = key;
    loadOrders(reset: true);
  }

  void onSearchInput(String val) {
    searchKey.value = val;
    loadOrders(reset: true);
  }

  void onSearchClear() {
    searchKey.value = '';
    loadOrders(reset: true);
  }

  void toggleExpand(String orderId) {
    expandedOrderId.value = expandedOrderId.value == orderId ? '' : orderId;
  }

  Future<void> loadOrders({bool reset = false}) async {
    if (orderLoading.value) return;
    if (!reset && !orderHasMore.value) return;

    orderLoading.value = true;
    if (reset) {
      orderPage.value = 1;
      orderHasMore.value = true;
    }

    try {
      final isOverdue = activeFilter.value == 'overdue';
      final params = <String, dynamic>{
        'deleteFlag': 0,
        'page': orderPage.value,
        'pageSize': isOverdue ? 50 : 15,
      };

      if (isOverdue) {
        params['status'] = 'production';
      } else {
        final filterVal = statFilters.firstWhere(
          (f) => f['key'] == activeFilter.value,
          orElse: () => {'value': ''},
        )['value'] as String;
        if (filterVal.isNotEmpty) params['status'] = filterVal;
      }

      if (searchKey.value.isNotEmpty) params['orderNo'] = searchKey.value;

      final res = await _api.listOrders(params);
      final data = _extractData(res);
      final records = (data['records'] as List?) ?? [];
      var newOrders = records.map((e) => _enrichOrder(e as Map<String, dynamic>)).toList();

      if (isOverdue) {
        newOrders = newOrders.where((o) => o['remainDaysClass'] == 'days-overdue').toList();
      }

      if (reset) {
        orders.value = newOrders;
      } else {
        orders.addAll(newOrders);
      }
      final total = data['total'] ?? 0;
      orderHasMore.value = orders.length < total;
      orderPage.value++;
    } catch (_) {}
    orderLoading.value = false;
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
}
