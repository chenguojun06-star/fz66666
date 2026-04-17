import 'package:get/get.dart';
import 'work_inbox_controller.dart';
class WorkInboxBinding extends Bindings { @override void dependencies() { Get.lazyPut(() => WorkInboxController()); } }
