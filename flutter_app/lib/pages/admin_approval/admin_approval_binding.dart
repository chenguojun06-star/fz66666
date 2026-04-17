import 'package:get/get.dart';
import 'admin_approval_controller.dart';

class AdminApprovalBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => AdminApprovalController());
  }
}
