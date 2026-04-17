import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import 'work_ai_controller.dart';

class WorkAiPage extends GetView<WorkAiController> {
  const WorkAiPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AI 助手')),
      backgroundColor: AppColors.bgPage,
      body: Column(children: [
        Expanded(child: Obx(() => ListView.builder(
          padding: const EdgeInsets.all(AppSpacing.lg),
          itemCount: controller.messages.length,
          reverse: true,
          itemBuilder: (_, i) {
            final idx = controller.messages.length - 1 - i;
            final msg = controller.messages[idx];
            return Align(
              alignment: msg.isUser ? Alignment.centerRight : Alignment.centerLeft,
              child: Container(
                margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
                decoration: BoxDecoration(
                  color: msg.isUser ? AppColors.primary : AppColors.bgCard,
                  borderRadius: BorderRadius.circular(AppSpacing.md),
                  border: msg.isUser ? null : Border.all(color: AppColors.borderLight),
                ),
                child: Text(msg.content, style: TextStyle(fontSize: 14, color: msg.isUser ? Colors.white : AppColors.textPrimary)),
              ),
            );
          },
        ))),
        Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: const BoxDecoration(color: AppColors.bgCard, border: Border(top: BorderSide(color: AppColors.borderLight))),
          child: Row(children: [
            Expanded(child: TextField(onChanged: (v) => controller.inputText.value = v, decoration: const InputDecoration(hintText: '输入问题...', isDense: true, contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8)))),
            const SizedBox(width: 8),
            Obx(() => IconButton(
              onPressed: controller.sending.value ? null : controller.sendMessage,
              icon: controller.sending.value
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.send, color: AppColors.primary),
            )),
          ]),
        ),
      ]),
    );
  }
}
