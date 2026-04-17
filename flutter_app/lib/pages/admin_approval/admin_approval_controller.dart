import 'package:get/get.dart';
import '../../utils/api_service.dart';

class AdminApprovalController extends GetxController {
  final ApiService _api = Get.find<ApiService>();

  // 响应式变量
  final RxList pendingUsers = [].obs;
  final RxBool isLoading = false.obs;

  @override
  void onInit() {
    super.onInit();
    fetchPendingUsers();
  }

  // 获取待审批用户列表
  Future<void> fetchPendingUsers() async {
    try {
      isLoading.value = true;
      final response = await _api.listPendingUsers();
      if (response.statusCode == 200) {
        pendingUsers.assignAll(response.data['data'] ?? []);
      }
    } catch (e) {
      Get.snackbar('错误', '获取列表失败: $e');
    } finally {
      isLoading.value = false;
    }
  }

  // 审批通过
  Future<void> approve(String userId) async {
    try {
      final response = await _api.approveUser(userId);
      if (response.statusCode == 200) {
        Get.snackbar('成功', '已批准该用户');
        fetchPendingUsers();
      }
    } catch (e) {
      Get.snackbar('错误', '审批操作失败: $e');
    }
  }

  // 拒绝审批
  Future<void> reject(String userId) async {
    try {
      final response = await _api.rejectUser(userId);
      if (response.statusCode == 200) {
        Get.snackbar('信息', '已拒绝该申请');
        fetchPendingUsers();
      }
    } catch (e) {
      Get.snackbar('错误', '操作失败: $e');
    }
  }
}
