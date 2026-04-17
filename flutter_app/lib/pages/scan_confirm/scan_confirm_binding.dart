import 'package:get/get.dart';
import 'scan_confirm_controller.dart';

class ScanConfirmBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => ScanConfirmController());
  }
}
