import 'package:get/get.dart';
import 'admin_feedback_controller.dart';

class AdminFeedbackBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => AdminFeedbackController());
  }
}
