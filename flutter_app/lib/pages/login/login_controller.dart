import 'package:get/get.dart';
import 'package:dio/dio.dart';
import '../../utils/api_service.dart';
import '../../utils/storage_service.dart';
import '../../routes/app_routes.dart';

class LoginController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final StorageService _storage = Get.find<StorageService>();

  final username = ''.obs;
  final password = ''.obs;
  final showPassword = false.obs;
  final loading = false.obs;

  final tenantSearchText = ''.obs;
  final selectedTenantId = ''.obs;
  final selectedTenantName = ''.obs;
  final showTenantResults = false.obs;
  final filteredTenants = <Map<String, dynamic>>[].obs;
  final tenantsLoading = false.obs;
  final allTenants = <Map<String, dynamic>>[];

  @override
  void onInit() {
    super.onInit();
    _loadTenants();
  }

  Future<void> _loadTenants() async {
    tenantsLoading.value = true;
    try {
      final res = await _api.tenantPublicList();
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final list = data['data'] as List? ?? [];
        allTenants.clear();
        allTenants.addAll(list.map((e) => e as Map<String, dynamic>));
      }
    } catch (_) {}
    tenantsLoading.value = false;
  }

  void onTenantSearch(String text) {
    tenantSearchText.value = text;
    if (text.isEmpty) {
      showTenantResults.value = false;
      filteredTenants.clear();
      return;
    }
    showTenantResults.value = true;
    filteredTenants.value = allTenants
        .where((t) => (t['tenantName'] ?? '').toString().contains(text))
        .toList();
  }

  void onTenantSelect(int index) {
    final tenant = filteredTenants[index];
    selectedTenantId.value = tenant['id']?.toString() ?? '';
    selectedTenantName.value = tenant['tenantName']?.toString() ?? '';
    tenantSearchText.value = tenant['tenantName']?.toString() ?? '';
    showTenantResults.value = false;
  }

  void onClearTenant() {
    selectedTenantId.value = '';
    selectedTenantName.value = '';
    tenantSearchText.value = '';
    showTenantResults.value = false;
  }

  void togglePassword() => showPassword.value = !showPassword.value;

  Future<void> onLogin() async {
    if (selectedTenantId.value.isEmpty) {
      Get.snackbar('提示', '请选择公司', snackPosition: SnackPosition.TOP);
      return;
    }
    if (username.value.isEmpty || password.value.isEmpty) {
      Get.snackbar('提示', '请输入用户名和密码', snackPosition: SnackPosition.TOP);
      return;
    }

    loading.value = true;
    try {
      final res = await _api.login({
        'username': username.value,
        'password': password.value,
        'tenantId': selectedTenantId.value,
      });

      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final token = data['data']?['token'] ?? data['data']?.toString() ?? '';
        if (token.isNotEmpty) {
          await _storage.setToken(token);
          try {
            final meRes = await _api.getMe();
            final meData = meRes.data;
            if (meData is Map && meData['data'] != null) {
              await _storage.setUserInfo(meData['data'] as Map<String, dynamic>);
            }
          } catch (_) {}
          Get.offAllNamed(AppRoutes.home);
        } else {
          Get.snackbar('登录失败', '未获取到令牌', snackPosition: SnackPosition.TOP);
        }
      } else {
        final msg = data is Map ? (data['message'] ?? data['msg'] ?? '登录失败') : '登录失败';
        Get.snackbar('登录失败', msg.toString(), snackPosition: SnackPosition.TOP);
      }
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? '网络异常';
      Get.snackbar('登录失败', msg.toString(), snackPosition: SnackPosition.TOP);
    } catch (e) {
      Get.snackbar('登录失败', e.toString(), snackPosition: SnackPosition.TOP);
    } finally {
      loading.value = false;
    }
  }

  void goToRegister() => Get.toNamed(AppRoutes.register);
}
