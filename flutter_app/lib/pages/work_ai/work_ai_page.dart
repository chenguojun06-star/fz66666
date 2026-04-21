import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import 'work_ai_controller.dart';

class WorkAiPage extends GetView<WorkAiController> {
  const WorkAiPage({super.key});

  static const _levelColors = {
    'danger': {'border': Color(0xFFFF4D4F), 'bg': Color(0xFFFFF1F0), 'title': Color(0xFFCF1322)},
    'warning': {'border': Color(0xFFFA8C16), 'bg': Color(0xFFFFF7E6), 'title': Color(0xFFD46B08)},
    'success': {'border': Color(0xFF52C41A), 'bg': Color(0xFFF6FFED), 'title': Color(0xFF389E0D)},
    'info': {'border': Color(0xFF1677FF), 'bg': Color(0xFFF0F5FF), 'title': Color(0xFF1D39C4)},
  };

  static const _levelIcons = {'danger': '🔴', 'warning': '🟠', 'success': '🟢', 'info': '🔵'};

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
                constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                child: msg.isUser
                    ? Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(AppSpacing.md)),
                        child: Text(msg.content, style: const TextStyle(fontSize: 14, color: Colors.white)),
                      )
                    : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        if (msg.content.isNotEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(color: AppColors.bgCard, borderRadius: BorderRadius.circular(AppSpacing.md), border: Border.all(color: AppColors.borderLight)),
                            child: Text(msg.content, style: const TextStyle(fontSize: 14, color: AppColors.textPrimary)),
                          ),
                        ...msg.insightCards.map((card) => _buildInsightCard(card)),
                        ...msg.actionCards.map((act) => _buildActionCard(act)),
                        if (msg.clarificationHints.isNotEmpty) _buildClarificationCard(msg.clarificationHints),
                      ]),
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

  Widget _buildInsightCard(InsightCard card) {
    final colors = _levelColors[card.level] ?? _levelColors['info']!;
    final icon = _levelIcons[card.level] ?? '🔵';
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: colors['bg'],
        borderRadius: BorderRadius.circular(8),
        border: Border(left: BorderSide(color: colors['border']!, width: 3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('$icon ${card.title}', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors['title'])),
        if (card.summary != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(card.summary!, style: const TextStyle(fontSize: 12, color: Color(0xFF333333)))),
        if (card.painPoint != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text('⚠ ${card.painPoint}', style: const TextStyle(fontSize: 12, color: Color(0xFFCF1322)))),
        if (card.execute != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text('→ ${card.execute}', style: const TextStyle(fontSize: 12, color: Color(0xFF1677FF)))),
        if (card.evidence.isNotEmpty)
          Padding(padding: const EdgeInsets.only(top: 4), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: card.evidence.take(3).map((e) => Text('· $e', style: const TextStyle(fontSize: 11, color: Color(0xFF8C8C8C)))).toList())),
        if (card.source != null || card.confidence != null)
          Padding(padding: const EdgeInsets.only(top: 4), child: Row(children: [
            if (card.source != null) Text('来源:${card.source}', style: const TextStyle(fontSize: 10, color: Color(0xFFBFBFBF))),
            const SizedBox(width: 6),
            if (card.confidence != null) Text(card.confidence!, style: const TextStyle(fontSize: 10, color: Color(0xFFBFBFBF))),
          ])),
      ]),
    );
  }

  Widget _buildActionCard(Map<String, dynamic> act) {
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: const Color(0xFFF0F5FF), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFADC6FF))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('⚡ ${act['title'] ?? ''}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF1D39C4))),
        if (act['desc'] != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(act['desc'].toString(), style: const TextStyle(fontSize: 12, color: Color(0xFF666666)))),
      ]),
    );
  }

  Widget _buildClarificationCard(List<String> hints) {
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: const Color(0xFFFFF7E6), borderRadius: BorderRadius.circular(8)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('🤔 需要补充信息：', style: TextStyle(fontSize: 12, color: Color(0xFFD46B08))),
        const SizedBox(height: 6),
        Wrap(spacing: 6, runSpacing: 4, children: hints.map((h) => ActionChip(
          label: Text(h, style: const TextStyle(fontSize: 12)),
          backgroundColor: Colors.white,
          side: const BorderSide(color: Color(0xFFFFD591)),
          onPressed: () { controller.inputText.value = h; controller.sendMessage(); },
        )).toList()),
      ]),
    );
  }
}
