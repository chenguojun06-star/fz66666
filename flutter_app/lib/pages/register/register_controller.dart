import 'package:get/get.dart';
import 'package:dio/dio.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';
import '../../routes/app_routes.dart';

class RegisterController extends GetxController {
  final ApiService _api = Get.find<ApiService>();

  final phone = ''.obs;
  final realName = ''.obs;
  final password = ''.obs;
  final confirmPassword = ''.obs;
  final selectedTenantId = ''.obs;
  final selectedTenantName = ''.obs;
  final selectedRoleCode = ''.obs;
  final selectedRoleName = ''.obs;
  final loading = false.obs;
  final tenants = <Map<String, dynamic>>[].obs;
  final roles = <Map<String, dynamic>>[].obs;
  final tenantSearchText = ''.obs;
  final filteredTenants = <Map<String, dynamic>>[].obs;

  @override
  void onInit() {
    super.onInit();
    _loadTenants();
    _loadRoles();
  }

  Future<void> _loadTenants() async {
    try {
      final res = await _api.tenantPublicList();
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final list = data['data'] as List? ?? [];
        tenants.value = list.map((e) => e as Map<String, dynamic>).toList();
        filteredTenants.value = tenants.toList();
      }
    } catch (_) {}
  }

  Future<void> _loadRoles() async {
    try {
      final res = await _api.listRoles();
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final list = data['data'] as List? ?? [];
        roles.value = list.map((e) => e as Map<String, dynamic>).toList();
      }
    } catch (_) {}
  }

  void onTenantSearch(String text) {
    tenantSearchText.value = text;
    if (text.isEmpty) {
      filteredTenants.value = tenants.toList();
    } else {
      filteredTenants.value = tenants.where((t) => (t['tenantName'] ?? '').toString().contains(text)).toList();
    }
  }

  void selectTenant(Map<String, dynamic> tenant) {
    selectedTenantId.value = tenant['id']?.toString() ?? '';
    selectedTenantName.value = tenant['tenantName']?.toString() ?? '';
  }

  void selectRole(Map<String, dynamic> role) {
    selectedRoleCode.value = role['roleCode']?.toString() ?? '';
    selectedRoleName.value = role['roleName']?.toString() ?? '';
  }

  Future<void> onRegister() async {
    if (selectedTenantId.value.isEmpty) {
      Get.snackbar('提示', '请选择公司', snackPosition: SnackPosition.TOP);
      return;
    }
    if (phone.value.isEmpty || realName.value.isEmpty || password.value.isEmpty) {
      Get.snackbar('提示', '请填写完整信息', snackPosition: SnackPosition.TOP);
      return;
    }
    if (password.value != confirmPassword.value) {
      Get.snackbar('提示', '两次密码不一致', snackPosition: SnackPosition.TOP);
      return;
    }

    loading.value = true;
    try {
      final res = await _api.workerRegister({
        'phone': phone.value,
        'realName': realName.value,
        'password': password.value,
        'tenantId': selectedTenantId.value,
        'roleCode': selectedRoleCode.value,
      });
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('注册成功', '请等待管理员审批', snackPosition: SnackPosition.TOP);
        Get.offAllNamed(AppRoutes.login);
      } else {
        final msg = data is Map ? (data['message'] ?? '注册失败') : '注册失败';
        Get.snackbar('注册失败', msg.toString(), snackPosition: SnackPosition.TOP);
      }
    } on DioException catch (e) {
      ErrorHandler.handle(e);
    } finally {
      loading.value = false;
    }
  }
}
