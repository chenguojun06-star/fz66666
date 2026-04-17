import 'package:get/get.dart';
import '../../utils/api_service.dart';

class WarehouseController extends GetxController {
  final ApiService _api = Get.find<ApiService>();

  // 状态管理
  final RxList inventoryList = [].obs; // 成品库存列表
  final RxBool isLoading = false.obs;
  final RxString searchQuery = ''.obs;

  @override
  void onInit() {
    super.onInit();
    fetchInventory();
  }

  // 获取成品库存
  Future<void> fetchInventory() async {
    try {
      isLoading.value = true;
      // 这里的接口对应 ApiService 中的 listFinishedInventory
      final response = await _api.listFinishedInventory();
      if (response.statusCode == 200) {
        inventoryList.assignAll(response.data['data'] ?? []);
      }
    } catch (e) {
      Get.snackbar('获取失败', '无法连接到仓库服务器: $e',
        snackPosition: SnackPosition.BOTTOM);
    } finally {
      isLoading.value = false;
    }
  }

  // 搜索过滤逻辑
  List get filteredInventory {
    if (searchQuery.isEmpty) return inventoryList;
    return inventoryList.where((item) {
      final String name = (item['styleName'] ?? '').toString().toLowerCase();
      final String code = (item['styleNo'] ?? '').toString().toLowerCase();
      return name.contains(searchQuery.value.toLowerCase()) ||
             code.contains(searchQuery.value.toLowerCase());
    }).toList();
  }
}
