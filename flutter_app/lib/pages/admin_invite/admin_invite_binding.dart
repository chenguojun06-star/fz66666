import 'package:get/get.dart';
import 'admin_invite_controller.dart';

class AdminInviteBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => AdminInviteController());
  }
}
