import 'package:get/get.dart';
import 'work_ai_controller.dart';

class WorkAiBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<WorkAiController>(() => WorkAiController());
  }
}
