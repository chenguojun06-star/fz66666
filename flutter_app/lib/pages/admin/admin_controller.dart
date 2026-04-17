import 'package:get/get.dart';
import '../../utils/api_service.dart';
import '../../utils/storage_service.dart';
import '../../routes/app_routes.dart';

class AdminController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final StorageService _storage = Get.find<StorageService>();

  final userName = ''.obs;
  final roleDisplayName = ''.obs;
  final onlineCount = 0.obs;
  final showApprovalEntry = false.obs;

  @override
  void onInit() {
    super.onInit();
    _loadUserInfo();
    _checkApprovalEntry();
  }

  void _loadUserInfo() {
    final info = _storage.getUserInfo();
    if (info != null) {
      userName.value = info['realName']?.toString() ?? info['name']?.toString() ?? info['username']?.toString() ?? '未知用户';
      roleDisplayName.value = info['roleName']?.toString() ?? '普通用户';
    }
    _api.getOnlineCount().then((res) {
      final data = res.data;
      if (data is Map && data['data'] != null) {
        onlineCount.value = int.tryParse(data['data'].toString()) ?? 0;
      }
    }).catchError((_) {});
  }

  void _checkApprovalEntry() {
    final role = _storage.getUserRole();
    showApprovalEntry.value = role == 'admin' || role == '管理员' || role == 'supervisor' || role == '主管' || _storage.isTenantOwner();
  }

  String get avatarLetter => userName.value.isNotEmpty ? userName.value[0] : '?';

  List<Map<String, dynamic>> getMenuItems() {
    final items = <Map<String, dynamic>>[
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
