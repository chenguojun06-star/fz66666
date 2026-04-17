import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class BundleSplitController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final orderNo = ''.obs;
  final bundles = <Map<String, dynamic>>[].obs;
  final loading = false.obs;

  @override
  void onInit() {
    super.onInit();
    orderNo.value = Get.arguments?['orderNo'] ?? '';
    if (orderNo.value.isNotEmpty) loadBundles();
  }

  Future<void> loadBundles() async {
    loading.value = true;
    try {
      final res = await _api.listBundles(orderNo.value);
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        final list = data['data'] as List? ?? [];
        bundles.value = list.map((e) => e as Map<String, dynamic>).toList();
      }
    } catch (e) { ErrorHandler.handle(e); }
    finally { loading.value = false; }
  }

  Future<void> doSearch(String keyword) async {
    if (keyword.isEmpty) return;
    orderNo.value = keyword;
    loadBundles();
  }

  Future<void> splitTransfer(String bundleId, int splitQty) async {
    try {
      final res = await _api.splitTransfer({'bundleId': bundleId, 'splitQuantity': splitQty});
      final data = res.data;
      if (data is Map && data['code'] == 200) {
        Get.snackbar('成功', '拆分完成', snackPosition: SnackPosition.TOP, backgroundColor: AppColors.success, colorText: Colors.white);
        loadBundles();
      }
    } catch (e) { ErrorHandler.handle(e); }
  }
}
