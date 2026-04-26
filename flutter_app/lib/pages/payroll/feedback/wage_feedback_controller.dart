import 'package:get/get.dart';
import '../../../utils/api_service.dart';
import '../../../utils/error_handler.dart';

class WageFeedbackController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final feedbackList = <Map<String, dynamic>>[].obs;
  final loading = false.obs;
  final submitting = false.obs;
  final showForm = false.obs;
  final settlementId = ''.obs;
  final feedbackType = 'CONFIRM'.obs;
  final feedbackContent = ''.obs;
  final statusFilter = ''.obs;

  @override
  void onInit() {
    super.onInit();
    loadFeedbackList();
  }

  Future<void> loadFeedbackList() async {
    loading.value = true;
    try {
      final params = <String, dynamic>{};
      if (statusFilter.value.isNotEmpty) params['status'] = statusFilter.value;
      final res = await _api.wageSettlementFeedbackMyList(params.isNotEmpty ? params : null);
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] is List) {
        feedbackList.value = (data['data'] as List).map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e as Map)).toList();
      } else {
        feedbackList.clear();
      }
    } catch (e) {
      ErrorHandler.handle(e);
    } finally {
      loading.value = false;
    }
  }

  Future<void> submitFeedback() async {
    if (settlementId.value.trim().isEmpty) {
      Get.snackbar('提示', '请输入结算单ID');
      return;
    }
    if (feedbackType.value == 'OBJECTION' && feedbackContent.value.trim().isEmpty) {
      Get.snackbar('提示', '提出异议时必须填写反馈内容');
      return;
    }
    submitting.value = true;
    try {
      await _api.wageSettlementFeedbackSubmit({
        'settlementId': settlementId.value,
        'feedbackType': feedbackType.value,
        'feedbackContent': feedbackContent.value,
      });
      Get.snackbar('成功', '提交成功');
      showForm.value = false;
      feedbackContent.value = '';
      settlementId.value = '';
      loadFeedbackList();
    } catch (e) {
      ErrorHandler.handle(e);
    } finally {
      submitting.value = false;
    }
  }
}
