import 'package:get/get.dart';
import 'warehouse_controller.dart';
class WarehouseBinding extends Bindings { @override void dependencies() { Get.lazyPut(() => WarehouseController()); } }
