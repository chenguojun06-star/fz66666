import 'package:get/get.dart';
import 'scan_quality_controller.dart';

class ScanQualityBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => ScanQualityController());
  }
}
