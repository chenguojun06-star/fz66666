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
                        if (msg.overdueFactoryCard != null) _buildOverdueFactoryCard(msg.overdueFactoryCard!),
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

  Widget _buildOverdueFactoryCard(OverdueFactoryCard card) {
    return Container(
      margin: const EdgeInsets.only(top: 6),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xFFFFF1F0), Color(0xFFFFF7E6)]),
            borderRadius: const BorderRadius.only(topLeft: Radius.circular(8), topRight: Radius.circular(8)),
            border: Border.all(color: const Color(0xFFFFCCC7)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(width: 6, height: 6, decoration: const BoxDecoration(color: Color(0xFFFF4D4F), shape: BoxShape.circle)),
              const SizedBox(width: 4),
              const Text('逾期订单总览', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFFCF1322))),
            ]),
            const SizedBox(height: 6),
            Wrap(spacing: 4, runSpacing: 4, children: [
              _buildStatChip('${card.overdueCount}', '张', '逾期订单', highlight: true),
              _buildStatChip('${card.totalQuantity}', '件', '总件数'),
              _buildStatChip('${card.avgProgress}', '%', '平均进度'),
              _buildStatChip('${card.avgOverdueDays}', '天', '平均延期', highlight: true),
            ]),
          ]),
        ),
        ...card.factoryGroups.map((fg) => _buildFactoryGroupCard(fg)),
      ]),
    );
  }

  Widget _buildStatChip(String value, String unit, String label, {bool highlight = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: highlight ? const Color(0xFFFFF1F0) : Colors.white.withValues(alpha: 0.85),
        border: Border.all(color: highlight ? const Color(0xFFFFA39E) : const Color(0xFFFFD8D8)),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Column(children: [
        Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Text(value, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: highlight ? const Color(0xFFCF1322) : const Color(0xFF262626))),
          Text(unit, style: const TextStyle(fontSize: 9, color: Color(0xFF8C8C8C))),
        ]),
        Text(label, style: const TextStyle(fontSize: 9, color: Color(0xFF8C8C8C))),
      ]),
    );
  }

  Widget _buildFactoryGroupCard(OverdueFactoryGroup fg) {
    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFF0F0F0)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 3, offset: const Offset(0, 1))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('🏭 ${fg.factoryName}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF262626))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(999)),
            child: Text('${fg.totalOrders}张 · ${fg.totalQuantity}件', style: const TextStyle(fontSize: 10, color: Color(0xFF8C8C8C))),
          ),
        ]),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.only(bottom: 6),
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFF0F0F0), style: BorderStyle.solid))),
          child: Row(children: [
            _buildMetricItem('平均进度', '${fg.avgProgress}%', danger: fg.avgProgress < 50),
            const SizedBox(width: 12),
            _buildMetricItem('平均延期', '${fg.avgOverdueDays}天', danger: fg.avgOverdueDays > 7),
            const SizedBox(width: 12),
            _buildMetricItem('预计完成', fg.estimatedCompletionDays > 0 ? '${fg.estimatedCompletionDays}天' : '—'),
            const SizedBox(width: 12),
            _buildMetricItem('生产人数', '${fg.activeWorkers > 0 ? fg.activeWorkers : '—'}人'),
          ]),
        ),
        const SizedBox(height: 4),
        ...fg.orders.map((od) => _buildOverdueOrderItem(od)),
      ]),
    );
  }

  Widget _buildMetricItem(String label, String value, {bool danger = false}) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontSize: 9, color: Color(0xFF8C8C8C))),
      Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: danger ? const Color(0xFFCF1322) : const Color(0xFF262626))),
    ]);
  }

  Widget _buildOverdueOrderItem(OverdueFactoryOrder od) {
    return Container(
      margin: const EdgeInsets.only(top: 3),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      decoration: BoxDecoration(color: const Color(0xFFFAFAFA), borderRadius: BorderRadius.circular(4)),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Row(children: [
          Text(od.orderNo, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF1890FF))),
          if (od.styleNo != null) Padding(padding: const EdgeInsets.only(left: 4), child: Text(od.styleNo!, style: const TextStyle(fontSize: 10, color: Color(0xFF8C8C8C)))),
        ]),
        Row(children: [
          Text('${od.progress}%', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: od.progress < 50 ? const Color(0xFFFF4D4F) : const Color(0xFFFAAD14))),
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
            decoration: BoxDecoration(color: const Color(0xFFFFF1F0), borderRadius: BorderRadius.circular(3)),
            child: Text('延${od.overdueDays}天', style: const TextStyle(fontSize: 10, color: Color(0xFFCF1322))),
          ),
        ]),
      ]),
    );
  }
}
