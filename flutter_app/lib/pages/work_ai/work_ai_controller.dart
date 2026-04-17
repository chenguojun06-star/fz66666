import 'package:get/get.dart';
import 'package:flutter/material.dart';
import '../../utils/api_service.dart';

class WorkAiController extends GetxController {
  final ApiService _api = Get.find<ApiService>();

  final RxList<Map<String, dynamic>> messages = <Map<String, dynamic>>[
    {
      'role': 'assistant',
      'content': '您好！我是小云 AI 助手，您的服装供应链专家。您可以问我关于库存、进度、采购或扫码异常的问题。',
      'time': DateTime.now(),
    }
  ].obs;

  final TextEditingController inputController = TextEditingController();
  final RxBool isTyping = false.obs;
  final ScrollController scrollController = ScrollController();

  // 发送消息
  Future<void> sendMessage() async {
    final text = inputController.text.trim();
    if (text.isEmpty) return;

    // 添加用户消息
    messages.add({
      'role': 'user',
      'content': text,
      'time': DateTime.now(),
    });
    inputController.clear();
    _scrollToBottom();

    // 模拟或调用 AI 接口
    isTyping.value = true;
    try {
      // 这里的接口对应 ApiService 中的 aiAdvisorChat
      final response = await _api.aiAdvisorChat({'message': text});

      String reply = '抱歉，我现在无法处理您的请求。';
      if (response.statusCode == 200) {
        reply = response.data['data']?['reply'] ?? reply;
      }

      messages.add({
        'role': 'assistant',
        'content': reply,
        'time': DateTime.now(),
      });
    } catch (e) {
      messages.add({
        'role': 'assistant',
        'content': '网络连接似乎有点问题，请稍后再试。',
        'time': DateTime.now(),
      });
    } finally {
      isTyping.value = false;
      _scrollToBottom();
    }
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (scrollController.hasClients) {
        scrollController.animateTo(
          scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void onClose() {
    inputController.dispose();
    scrollController.dispose();
    super.onClose();
  }
}
