import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import '../../../components/empty_state.dart';
import 'wage_feedback_controller.dart';

class WageFeedbackPage extends GetView<WageFeedbackController> {
  const WageFeedbackPage({super.key});

  String _statusText(String? s) {
    switch (s) {
      case 'PENDING': return '待处理';
      case 'RESOLVED': return '已解决';
      case 'REJECTED': return '已驳回';
      default: return '-';
    }
  }

  Color _statusColor(String? s) {
    switch (s) {
      case 'PENDING': return AppColors.warning;
      case 'RESOLVED': return AppColors.success;
      case 'REJECTED': return AppColors.danger;
      default: return AppColors.textTertiary;
    }
  }

  String _fmtTime(dynamic v) {
    if (v == null) return '-';
    final s = v.toString().replaceFirst(' ', 'T');
    final d = DateTime.tryParse(s);
    if (d == null) return '-';
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('工资结算反馈')),
      backgroundColor: AppColors.bgPage,
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showFormDialog(context),
        backgroundColor: AppColors.primary,
        child: const Icon(Icons.add, color: Colors.white),
      ),
      body: Obx(() {
        if (controller.loading.value) {
          return const Center(child: CircularProgressIndicator());
        }
        if (controller.feedbackList.isEmpty) {
          return const EmptyState(iconData: Icons.feedback_outlined, title: '暂无反馈记录');
        }
        return RefreshIndicator(
          onRefresh: controller.loadFeedbackList,
          child: ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.md),
            itemCount: controller.feedbackList.length,
            itemBuilder: (ctx, i) {
              final item = controller.feedbackList[i];
              final type = item['feedbackType'] as String? ?? '';
              final status = item['status'] as String? ?? '';
              return Card(
                margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: type == 'CONFIRM'
                                  ? AppColors.success.withOpacity(0.1)
                                  : AppColors.warning.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              type == 'CONFIRM' ? '确认' : '异议',
                              style: TextStyle(
                                fontSize: 12,
                                color: type == 'CONFIRM' ? AppColors.success : AppColors.warning,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          Text(
                            _statusText(status),
                            style: TextStyle(
                              fontSize: 12,
                              color: _statusColor(status),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '结算单: ${item['settlementId'] ?? '-'}',
                        style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                      ),
                      if (item['feedbackContent'] != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          item['feedbackContent'].toString(),
                          style: const TextStyle(fontSize: 14),
                        ),
                      ],
                      if (item['resolveRemark'] != null) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.success.withOpacity(0.06),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('处理结果', style: TextStyle(fontSize: 12, color: AppColors.success, fontWeight: FontWeight.w600)),
                              const SizedBox(height: 2),
                              Text(item['resolveRemark'].toString(), style: const TextStyle(fontSize: 13)),
                              if (item['resolverName'] != null)
                                Text('处理人: ${item['resolverName']}', style: const TextStyle(fontSize: 11, color: AppColors.textTertiary)),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 4),
                      Align(
                        alignment: Alignment.centerRight,
                        child: Text(
                          _fmtTime(item['createTime']),
                          style: const TextStyle(fontSize: 11, color: AppColors.textTertiary),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      }),
    );
  }

  void _showFormDialog(BuildContext context) {
    controller.settlementId.value = '';
    controller.feedbackType.value = 'CONFIRM';
    controller.feedbackContent.value = '';
    controller.showForm.value = true;

    showDialog(
      context: context,
      builder: (ctx) => Obx(() => AlertDialog(
        title: const Text('提交工资结算反馈'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                decoration: const InputDecoration(labelText: '结算单ID', isDense: true),
                onChanged: (v) => controller.settlementId.value = v,
              ),
              const SizedBox(height: 16),
              const Text('反馈类型', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
              Row(
                children: [
                  Radio<String>(
                    value: 'CONFIRM',
                    groupValue: controller.feedbackType.value,
                    onChanged: (v) { if (v != null) controller.feedbackType.value = v; },
                  ),
                  const Text('确认无误'),
                  const SizedBox(width: 16),
                  Radio<String>(
                    value: 'OBJECTION',
                    groupValue: controller.feedbackType.value,
                    onChanged: (v) { if (v != null) controller.feedbackType.value = v; },
                  ),
                  const Text('提出异议'),
                ],
              ),
              if (controller.feedbackType.value == 'OBJECTION') ...[
                const SizedBox(height: 8),
                TextField(
                  decoration: const InputDecoration(labelText: '异议内容', isDense: true),
                  maxLines: 3,
                  maxLength: 500,
                  onChanged: (v) => controller.feedbackContent.value = v,
                ),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          ElevatedButton(
            onPressed: controller.submitting.value ? null : () async {
              await controller.submitFeedback();
              if (!controller.submitting.value) {
                Navigator.pop(ctx);
              }
            },
            child: controller.submitting.value
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('提交'),
          ),
        ],
      )),
    );
  }
}
