import 'package:get/get.dart';
import 'payroll_controller.dart';
class PayrollBinding extends Bindings { @override void dependencies() { Get.lazyPut(() => PayrollController()); } }
