import 'package:get/get.dart';
import 'admin_password_controller.dart';

class AdminPasswordBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => AdminPasswordController());
  }
}
