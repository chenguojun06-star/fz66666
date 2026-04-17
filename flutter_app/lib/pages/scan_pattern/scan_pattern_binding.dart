import 'package:get/get.dart';
import 'scan_pattern_controller.dart';
class ScanPatternBinding extends Bindings { @override void dependencies() { Get.lazyPut(() => ScanPatternController()); } }
