import 'package:flutter/material.dart' show Icons;
import 'package:get/get.dart';
import '../../utils/api_service.dart';
import '../../utils/storage_service.dart';
import '../../utils/permission_service.dart';
import '../../utils/event_bus.dart';
import '../../routes/app_routes.dart';

class HomeController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final StorageService _storage = Get.find<StorageService>();

  final userName = '用户'.obs;
  final greeting = ''.obs;
  final unreadNoticeCount = 0.obs;
  final dateInfo = <String, String>{}.obs;
  final dailyTip = ''.obs;

  static const _dailyTips = [
    '专注当下，效率自然来',
    '细节决定品质',
    '每一步都算数',
    '质量是最好的名片',
    '团队协作，事半功倍',
    '今日事今日毕',
    '精益求精，追求卓越',
    '安全生产，人人有责',
    '数据驱动，科学决策',
    '沟通是效率的基石',
  ];

  @override
  void onInit() {
    super.onInit();
    _computeGreeting();
    _computeDateInfo();
    _loadUserName();
    _loadUnreadCount();
    _bindWsEvents();
  }

  void _bindWsEvents() {
    EventBus.instance.on(EventBus.dataChanged, (data) {
      _loadUnreadCount();
    }, tag: 'HomeController');
    EventBus.instance.on(EventBus.orderProgressChanged, (data) {
      _loadUnreadCount();
    }, tag: 'HomeController');
    EventBus.instance.on(EventBus.warehousingNotify, (data) {
      _loadUnreadCount();
    }, tag: 'HomeController');
  }

  @override
  void onClose() {
    EventBus.instance.off('HomeController');
    super.onClose();
  }

  void _computeGreeting() {
    final h = DateTime.now().hour;
    if (h < 12) {
      greeting.value = '上午好';
    } else if (h < 18) {
      greeting.value = '下午好';
    } else {
      greeting.value = '晚上好';
    }
  }

  void _computeDateInfo() {
    final now = DateTime.now();
    final m = now.month;
    final d = now.day;
    final weekDays = ['日', '一', '二', '三', '四', '五', '六'];

    String season;
    String icon;
    if (m >= 3 && m <= 5) {
      season = '春';
      icon = '🌸';
    } else if (m >= 6 && m <= 8) {
      season = '夏';
      icon = '☀️';
    } else if (m >= 9 && m <= 11) {
      season = '秋';
      icon = '🍂';
    } else {
      season = '冬';
      icon = '❄️';
    }

    final tipIndex = (now.year * 366 + now.month * 31 + now.day) % _dailyTips.length;
    dailyTip.value = _dailyTips[tipIndex];

    dateInfo.value = {
      'icon': icon,
      'date': '$m月$d日',
      'day': '星期${weekDays[now.weekday % 7]}',
      'season': season,
    };
  }

  Future<void> _loadUserName() async {
    final info = _storage.getUserInfo();
    if (info != null) {
      userName.value = info['realName']?.toString() ?? info['name']?.toString() ?? '用户';
    }
    try {
      final res = await _api.getMe();
      final data = res.data;
      if (data is Map && data['data'] != null) {
        final me = data['data'] as Map<String, dynamic>;
        final name = me['realName']?.toString() ?? me['name']?.toString();
        if (name != null && name.isNotEmpty) {
          userName.value = name;
        }
        await _storage.setUserInfo(me);
      }
    } catch (_) {}
  }

  Future<void> _loadUnreadCount() async {
    try {
      final res = await _api.unreadNoticeCount();
      final data = res.data;
      if (data is Map && data['data'] != null) {
        unreadNoticeCount.value = int.tryParse(data['data'].toString()) ?? 0;
      }
    } catch (_) {}
  }

  List<Map<String, dynamic>> getMenuItems() {
    final permission = PermissionService();
    final canSeeDashboard = _storage.isTenantOwner() || _storage.isSuperAdmin() || permission.isManagement;
    return [
      if (canSeeDashboard)
        {'id': 'dashboard', 'name': '进度看板', 'icon': Icons.dashboard, 'color': 0xFF6366F1, 'route': AppRoutes.dashboard},
      {'id': 'production', 'name': '生产', 'icon': Icons.precision_manufacturing, 'color': 0xFF3B82F6, 'route': AppRoutes.work, 'prefTab': 'sewing'},
      {'id': 'quality', 'name': '扫码质检', 'icon': Icons.verified, 'color': 0xFF07C160, 'route': AppRoutes.scan},
      {'id': 'bundleSplit', 'name': '菲号单价', 'icon': Icons.content_cut, 'color': 0xFFFA9D3B, 'route': AppRoutes.bundleSplit},
      {'id': 'history', 'name': '历史记录', 'icon': Icons.history, 'color': 0xFF6467F0, 'route': AppRoutes.scanHistory},
      {'id': 'payroll', 'name': '当月工资', 'icon': Icons.payments, 'color': 0xFF14B8A6, 'route': AppRoutes.payroll},
    ];
  }

  void onMenuTap(String route, {String? prefTab}) {
    if (prefTab != null) {
      _storage.setValue('work_active_tab', prefTab);
    }
    Get.toNamed(route);
  }

  Future<void> refreshData() async {
    _computeGreeting();
    await _loadUserName();
    await _loadUnreadCount();
  }
}
