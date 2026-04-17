import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../utils/api_service.dart';
import '../../utils/error_handler.dart';

class ChatMessage {
  final String content;
  final bool isUser;
  final DateTime time;
  ChatMessage({required this.content, required this.isUser, required this.time});
}

class WorkAiController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final messages = <ChatMessage>[].obs;
  final inputText = ''.obs;
  final sending = false.obs;

  Future<void> sendMessage() async {
    final text = inputText.value.trim();
    if (text.isEmpty) return;
    messages.add(ChatMessage(content: text, isUser: true, time: DateTime.now()));
    inputText.value = '';
    sending.value = true;

    try {
      final res = await _api.aiAdvisorChat({'message': text});
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] != null) {
        final reply = data['data']['reply']?.toString() ?? data['data']['content']?.toString() ?? '收到';
        messages.add(ChatMessage(content: reply, isUser: false, time: DateTime.now()));
      } else {
        messages.add(ChatMessage(content: '抱歉，暂时无法回复', isUser: false, time: DateTime.now()));
      }
    } catch (e) {
      messages.add(ChatMessage(content: '网络异常，请稍后重试', isUser: false, time: DateTime.now()));
    } finally {
      sending.value = false;
    }
  }
}
