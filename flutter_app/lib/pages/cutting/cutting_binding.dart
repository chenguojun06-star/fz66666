import 'package:get/get.dart';
import 'cutting_controller.dart';
class CuttingBinding extends Bindings { @override void dependencies() { Get.lazyPut(() => CuttingController()); } }
