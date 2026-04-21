import 'package:get/get.dart';
import '../../utils/storage_service.dart';

class AdminInviteController extends GetxController {
  final StorageService _storage = Get.find<StorageService>();
  final inviteLink = ''.obs;
  final loading = false.obs;

  @override
  void onInit() {
    super.onInit();
    _generateInviteInfo();
  }

  void _generateInviteInfo() {
    final info = _storage.getUserInfo();
    final tenantId = info?['tenantId']?.toString() ?? '';
    inviteLink.value = 'https://app.webyszl.cn/register?tenantId=$tenantId';
  }

  void copyLink() {
    // Flutter clipboard
  }
}
