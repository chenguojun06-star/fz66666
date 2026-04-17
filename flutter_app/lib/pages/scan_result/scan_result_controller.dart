import 'package:get/get.dart';
class ScanResultController extends GetxController {
  final result = <String, dynamic>{}.obs;

  @override
  void onInit() {
    super.onInit();
    result.value = Map<String, dynamic>.from(Get.arguments ?? {});
  }
}
