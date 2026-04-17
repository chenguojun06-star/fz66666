import 'package:get/get.dart';
import 'privacy_controller.dart';
class PrivacyBinding extends Bindings { @override void dependencies() { Get.lazyPut(() => PrivacyController()); } }
