import 'package:get/get.dart';
import 'procurement_controller.dart';
class ProcurementBinding extends Bindings { @override void dependencies() { Get.lazyPut(() => ProcurementController()); } }
