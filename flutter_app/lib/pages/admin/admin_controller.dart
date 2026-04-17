import 'package:get/get.dart';
import '../../utils/api_service.dart';
import '../../utils/storage_service.dart';
import '../../utils/event_bus.dart';
import '../../routes/app_routes.dart';

class AdminController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final StorageService _storage = Get.find<StorageService>();

  final userName = ''.obs;
  final roleDisplayName = ''.obs;
  final onlineCount = 0.obs;
  final showApprovalEntry = false.obs;
  final avatarUrl = ''.obs;
  final tenantName = ''.obs;
  final factoryName = ''.obs;
  final unreadNoticeCount = 0.obs;
  final appVersion = ''.obs;

  @override
  void onInit() {
    super.onInit();
    _loadUserInfo();
    _checkApprovalEntry();
    _loadTenantInfo();
    _loadUnreadCount();
    _loadAppVersion();
    _bindWsEvents();
  }

  void _bindWsEvents() {
    EventBus.instance.on(EventBus.noticeReceived, (data) {
      _loadUnreadCount();
    }, tag: 'AdminController');
    EventBus.instance.on(EventBus.dataChanged, (data) {
      _loadUnreadCount();
    }, tag: 'AdminController');
    EventBus.instance.on(EventBus.userOnlineChanged, (data) {
      _loadOnlineCount();
    }, tag: 'AdminController');
  }

  @override
  void onClose() {
    EventBus.instance.off(EventBus.noticeReceived, tag: 'AdminController');
    EventBus.instance.off(EventBus.dataChanged, tag: 'AdminController');
    EventBus.instance.off(EventBus.userOnlineChanged, tag: 'AdminController');
    super.onClose();
  }

  void _loadUserInfo() {
    final info = _storage.getUserInfo();
    if (info != null) {
      userName.value = info['realName']?.toString() ?? info['name']?.toString() ?? info['username']?.toString() ?? '未知用户';
      roleDisplayName.value = info['roleName']?.toString() ?? '普通用户';
      avatarUrl.value = info['avatar']?.toString() ?? info['avatarUrl']?.toString() ?? '';
      factoryName.value = info['factoryName']?.toString() ?? '';
    }
    _loadOnlineCount();

    _api.getMe().then((res) {
      final data = res.data;
      if (data is Map && data['data'] != null) {
        final me = data['data'] as Map<String, dynamic>;
        final name = me['realName']?.toString() ?? me['name']?.toString();
        if (name != null && name.isNotEmpty) {
          userName.value = name;
        }
        final avatar = me['avatar']?.toString() ?? me['avatarUrl']?.toString() ?? '';
        if (avatar.isNotEmpty) {
          avatarUrl.value = avatar;
        }
        final factory = me['factoryName']?.toString() ?? '';
        if (factory.isNotEmpty) {
          factoryName.value = factory;
        }
        _storage.setUserInfo(me);
      }
    }).catchError((_) {});
  }

  void _loadOnlineCount() {
    _api.getOnlineCount().then((res) {
      final data = res.data;
      if (data is Map && data['data'] != null) {
        onlineCount.value = int.tryParse(data['data'].toString()) ?? 0;
      }
    }).catchError((_) {});
  }

  void _loadTenantInfo() async {
    try {
      final res = await _api.myTenant();
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] != null) {
        final tenant = data['data'] as Map<String, dynamic>;
        tenantName.value = tenant['name']?.toString() ?? tenant['tenantName']?.toString() ?? '';
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

  void _loadAppVersion() {
    appVersion.value = 'v1.0.0';
  }

  void _checkApprovalEntry() {
    final role = _storage.getUserRole();
    showApprovalEntry.value = role == 'admin' || role == '管理员' || role == 'supervisor' || role == '主管' || _storage.isTenantOwner();
  }

  String get avatarLetter => userName.value.isNotEmpty ? userName.value[0] : '?';

  List<Map<String, dynamic>> getMenuItems() {
    final items = <Map<String, dynamic>>[
      {'id': 'inbox', 'label': '消息通知', 'icon': 0xE7F4, 'route': AppRoutes.workInbox, 'badge': unreadNoticeCount.value},
      if (showApprovalEntry.value)
        {'id': 'approval', 'label': '用户审批', 'icon': 0xE7FD, 'route': AppRoutes.adminApproval},
      {'id': 'password', 'label': '修改密码', 'icon': 0xE3B1, 'route': AppRoutes.adminPassword},
      {'id': 'feedback', 'label': '意见反馈', 'icon': 0xE87D, 'route': AppRoutes.adminFeedback},
      {'id': 'invite', 'label': '邀请员工', 'icon': 0xE7FE, 'route': AppRoutes.adminInvite},
      {'id': 'privacy', 'label': '隐私政策', 'icon': 0xE88F, 'route': AppRoutes.privacy},
    ];
    return items;
  }

  void onMenuTap(String route) => Get.toNamed(route);

  Future<void> onLogout() async {
    await _storage.clearToken();
    await _storage.clearUserInfo();
    await _storage.clearBusinessCache();
    Get.offAllNamed(AppRoutes.login);
  }
}
