import 'package:get/get.dart';
import 'scan_rescan_controller.dart';
class ScanRescanBinding extends Bindings { @override void dependencies() { Get.lazyPut(() => ScanRescanController()); } }
