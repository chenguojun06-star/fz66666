import 'package:get/get.dart';
import 'scan_result_controller.dart';
class ScanResultBinding extends Bindings { @override void dependencies() { Get.lazyPut(() => ScanResultController()); } }
