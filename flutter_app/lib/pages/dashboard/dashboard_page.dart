import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import '../../components/load_more.dart';
import 'dashboard_controller.dart';

class DashboardPage extends GetView<DashboardController> {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context) {
    Get.put(DashboardController());
    return Scaffold(
      appBar: AppBar(title: const Text('进度看板')),
      backgroundColor: AppColors.bgPage,
      body: Obx(() {
        if (controller.loading.value && controller.orders.isEmpty) {
          return _buildSkeleton();
        }
        return RefreshIndicator(
          onRefresh: () async {
            await controller.refreshCards();
            await controller.loadOrders(reset: true);
          },
          child: NotificationListener<ScrollNotification>(
            onNotification: (notification) {
              if (notification is ScrollEndNotification && notification.metrics.pixels >= notification.metrics.maxScrollExtent - 100) {
                controller.loadOrders();
              }
              return false;
            },
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildOverviewBar(),
                  const SizedBox(height: AppSpacing.md),
                  _buildCardGrid(),
                  const SizedBox(height: AppSpacing.lg),
                  _buildSearchBar(),
                  const SizedBox(height: AppSpacing.sm),
                  _buildStatBar(),
                  const SizedBox(height: AppSpacing.lg),
                  _buildOrderList(),
                ],
              ),
            ),
          ),
        );
      }),
    );
  }

  Widget _buildSkeleton() {
    return GridView.count(
      crossAxisCount: 2,
      mainAxisSpacing: AppSpacing.md,
      crossAxisSpacing: AppSpacing.md,
      shrinkWrap: true,
      childAspectRatio: 1.5,
      children: List.generate(4, (_) => Container(
        decoration: BoxDecoration(
          color: AppColors.bgCard,
          borderRadius: BorderRadius.circular(AppSpacing.lg),
        ),
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      )),
    );
  }

  Widget _buildOverviewBar() {
    return Row(
      children: [
        const Text('📊', style: TextStyle(fontSize: 16)),
        const SizedBox(width: 4),
        Text('今日概览 · ${controller.todayStr.value}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
        const Spacer(),
        if (controller.todayScanCount.value > 0)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.tagBgBlue,
              borderRadius: BorderRadius.circular(AppSpacing.lg),
            ),
            child: Text('今日扫码 ${controller.todayScanCount.value} 次', style: const TextStyle(fontSize: 11, color: AppColors.info)),
          ),
      ],
    );
  }

  Widget _buildCardGrid() {
    final c = controller.cards;
    return GridView.count(
      crossAxisCount: 2,
      mainAxisSpacing: AppSpacing.md,
      crossAxisSpacing: AppSpacing.md,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.45,
      children: [
        _buildSummaryCard(
          emoji: '✂️',
          title: '样衣开发',
          bgColor: const Color(0xFFF3EEFF),
          accentColor: const Color(0xFF7C3AED),
          metrics: [
            _Metric('${c['sample']?['developing'] ?? 0}', '款式总数', bold: true),
            _Metric('${c['sample']?['completed'] ?? 0}', '已完成'),
          ],
        ),
        _buildSummaryCard(
          emoji: '📦',
          title: '生产订单',
          bgColor: const Color(0xFFEFF6FF),
          accentColor: AppColors.primary,
          metrics: [
            _Metric('${c['production']?['total'] ?? 0}', '生产中', bold: true),
            _Metric('${c['production']?['pieces'] ?? 0}', '件数'),
            _Metric('${c['production']?['overdue'] ?? 0}', '已延期', isDanger: true),
          ],
        ),
        _buildSummaryCard(
          emoji: '📥',
          title: '入库',
          bgColor: const Color(0xFFECFDF5),
          accentColor: AppColors.success,
          metrics: [
            _Metric('${c['inbound']?['today'] ?? 0}', '今日', bold: true),
            _Metric('${c['inbound']?['week'] ?? 0}', '本周'),
          ],
        ),
        _buildSummaryCard(
          emoji: '📤',
          title: '出库',
          bgColor: const Color(0xFFFFF7ED),
          accentColor: AppColors.warning,
          metrics: [
            _Metric('${c['outbound']?['today'] ?? 0}', '今日', bold: true),
            _Metric('${c['outbound']?['week'] ?? 0}', '本周'),
          ],
        ),
      ],
    );
  }

  Widget _buildSummaryCard({
    required String emoji,
    required String title,
    required Color bgColor,
    required Color accentColor,
    required List<_Metric> metrics,
  }) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(AppSpacing.lg),
        border: Border.all(color: accentColor.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 18)),
              const SizedBox(width: 6),
              Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: accentColor)),
            ],
          ),
          const Spacer(),
          Row(
            children: metrics.map((m) {
              final isLast = m == metrics.last;
              return Row(
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(m.value, style: TextStyle(
                        fontSize: 22, fontWeight: FontWeight.w700,
                        color: m.isDanger ? AppColors.error : (m.bold ? accentColor : AppColors.textSecondary),
                      )),
                      Text(m.label, style: const TextStyle(fontSize: 11, color: AppColors.textTertiary)),
                    ],
                  ),
                  if (!isLast) ...[
                    const SizedBox(width: 12),
                    Container(width: 1, height: 28, color: AppColors.borderLight),
                    const SizedBox(width: 12),
                  ],
                ],
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      height: 40,
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(AppSpacing.md),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Row(
        children: [
          const SizedBox(width: 10),
          const Text('🔍', style: TextStyle(fontSize: 14)),
          const SizedBox(width: 6),
          Expanded(
            child: TextField(
              onChanged: controller.onSearchInput,
              style: const TextStyle(fontSize: 14),
              decoration: const InputDecoration(
                hintText: '搜索订单号 / 款号',
                hintStyle: TextStyle(fontSize: 14, color: AppColors.textTertiary),
                border: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.symmetric(vertical: 8),
              ),
            ),
          ),
          Obx(() => controller.searchKey.value.isNotEmpty
              ? GestureDetector(
                  onTap: controller.onSearchClear,
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 10),
                    child: Text('✕', style: TextStyle(fontSize: 14, color: AppColors.textTertiary)),
                  ),
                )
              : const SizedBox.shrink()),
        ],
      ),
    );
  }

  Widget _buildStatBar() {
    return Obx(() => SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: controller.statFilters.map((f) {
          final key = f['key'] as String;
          final isActive = controller.activeFilter.value == key;
          final count = controller.statCounts[key] ?? 0;
          final isOverdue = key == 'overdue';
          return GestureDetector(
            onTap: () => controller.onFilterTap(key),
            child: Container(
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: isActive
                    ? (isOverdue ? AppColors.tagBgRed : AppColors.tagBgBlue)
                    : AppColors.bgCard,
                borderRadius: BorderRadius.circular(AppSpacing.lg),
                border: Border.all(
                  color: isActive
                      ? (isOverdue ? AppColors.error.withValues(alpha: 0.3) : AppColors.primary.withValues(alpha: 0.3))
                      : AppColors.borderLight,
                ),
              ),
              child: Row(
                children: [
                  Text('$count', style: TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w700,
                    color: isActive
                        ? (isOverdue ? AppColors.error : AppColors.primary)
                        : AppColors.textPrimary,
                  )),
                  const SizedBox(width: 4),
                  Text(f['label'] as String, style: TextStyle(
                    fontSize: 12,
                    color: isActive
                        ? (isOverdue ? AppColors.error : AppColors.primary)
                        : AppColors.textSecondary,
                  )),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    ));
  }

  Widget _buildOrderList() {
    if (controller.orders.isEmpty && !controller.orderLoading.value) {
      return const EmptyState(iconData: Icons.inbox_outlined, title: '暂无订单数据');
    }
    return Column(
      children: [
        ...controller.orders.map((order) => _buildOrderCard(order)),
        Obx(() => LoadMore(
          status: controller.orderHasMore.value
              ? (controller.orderLoading.value ? LoadMoreStatus.loading : LoadMoreStatus.idle)
              : LoadMoreStatus.noMore,
          onLoadMore: () => controller.loadOrders(),
        )),
      ],
    );
  }

  Widget _buildOrderCard(Map<String, dynamic> order) {
    final orderId = order['id']?.toString() ?? '';
    final isExpanded = controller.expandedOrderId.value == orderId;
    final isOverdue = order['remainDaysClass'] == 'days-overdue';
    final progress = order['calculatedProgress'] ?? 0;

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(AppSpacing.lg),
        border: Border.all(color: isOverdue ? AppColors.error.withValues(alpha: 0.3) : AppColors.borderLight),
      ),
      child: Column(
        children: [
          InkWell(
            onTap: () => controller.toggleExpand(orderId),
            borderRadius: BorderRadius.circular(AppSpacing.lg),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                children: [
                  _buildOrderHeader(order),
                  const SizedBox(height: AppSpacing.sm),
                  _buildQtyRow(order),
                  const SizedBox(height: AppSpacing.sm),
                  _buildProgressRow(order, progress, isExpanded),
                ],
              ),
            ),
          ),
          if (isExpanded) _buildExpandedBody(order),
        ],
      ),
    );
  }

  Widget _buildOrderHeader(Map<String, dynamic> order) {
    final coverUrl = order['styleCoverUrl']?.toString() ?? '';
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: AppColors.bgGray,
            borderRadius: BorderRadius.circular(AppSpacing.md),
          ),
          child: coverUrl.isNotEmpty
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(AppSpacing.md),
                  child: Image.network(coverUrl, fit: BoxFit.cover,
                    errorBuilder: (_, error, stackTrace) => const Center(child: Text('👔', style: TextStyle(fontSize: 24))),
                  ),
                )
              : const Center(child: Text('👔', style: TextStyle(fontSize: 24))),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(order['orderNo']?.toString() ?? '-', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary))),
                  if (order['urgencyTagText'] != null)
                    _buildTag(order['urgencyTagText'].toString(), isUrgent: order['urgencyTagText'] == '急'),
                ],
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  Text(order['styleNo']?.toString() ?? '--', style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                  if (order['factoryName'] != null) ...[
                    const SizedBox(width: 8),
                    Expanded(child: Text(order['factoryName'].toString(), style: const TextStyle(fontSize: 12, color: AppColors.textTertiary), overflow: TextOverflow.ellipsis)),
                  ],
                ],
              ),
              if (order['deliveryDateStr'] != null || order['remainDaysText'] != null) ...[
                const SizedBox(height: 2),
                Row(
                  children: [
                    Text('交期 ${order['deliveryDateStr'] ?? order['deliveryDate'] ?? ''}', style: const TextStyle(fontSize: 11, color: AppColors.textTertiary)),
                    if (order['remainDaysText'] != null) ...[
                      const SizedBox(width: 6),
                      Text(order['remainDaysText'].toString(), style: TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w600,
                        color: order['remainDaysClass'] == 'days-overdue' ? AppColors.error
                            : order['remainDaysClass'] == 'days-soon' ? AppColors.warning
                            : AppColors.textTertiary,
                      )),
                    ],
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTag(String text, {bool isUrgent = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: isUrgent ? AppColors.tagBgRed : AppColors.tagBgBlue,
        borderRadius: BorderRadius.circular(AppSpacing.xs),
      ),
      child: Text(text, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: isUrgent ? AppColors.error : AppColors.info)),
    );
  }

  Widget _buildQtyRow(Map<String, dynamic> order) {
    final total = order['cuttingQty'] ?? order['totalQuantity'] ?? order['orderQuantity'] ?? 0;
    final completed = order['completedQuantity'] ?? 0;
    final remain = order['remainQuantity'] ?? 0;
    return Row(
      children: [
        _buildQtyItem('$total', '总数量'),
        Container(width: 1, height: 20, color: AppColors.borderLight, margin: const EdgeInsets.symmetric(horizontal: 12)),
        _buildQtyItem('$completed', '已完成'),
        Container(width: 1, height: 20, color: AppColors.borderLight, margin: const EdgeInsets.symmetric(horizontal: 12)),
        _buildQtyItem('$remain', '剩余'),
      ],
    );
  }

  Widget _buildQtyItem(String val, String label) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(val, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textTertiary)),
      ],
    );
  }

  Widget _buildProgressRow(Map<String, dynamic> order, int progress, bool isExpanded) {
    return Row(
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppSpacing.lg),
            child: LinearProgressIndicator(
              value: (progress / 100).clamp(0.0, 1.0),
              backgroundColor: AppColors.primary.withValues(alpha: 0.1),
              valueColor: AlwaysStoppedAnimation<Color>(
                order['remainDaysClass'] == 'days-overdue' ? AppColors.error : AppColors.primary,
              ),
              minHeight: 6,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text('$progress%', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        const SizedBox(width: 4),
        Icon(isExpanded ? Icons.expand_less : Icons.expand_more, size: 18, color: AppColors.textTertiary),
      ],
    );
  }

  Widget _buildExpandedBody(Map<String, dynamic> order) {
    final processNodes = (order['processNodes'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    return Container(
      padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.md),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.borderLight)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (processNodes.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            const Text('工序进度', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
            const SizedBox(height: AppSpacing.sm),
            ...processNodes.map((node) => _buildProcessItem(node)),
          ],
          const SizedBox(height: AppSpacing.md),
          GestureDetector(
            onTap: () {
              final orderNo = order['orderNo']?.toString() ?? '';
              if (orderNo.isNotEmpty) {
                Clipboard.setData(ClipboardData(text: orderNo));
                Get.snackbar('已复制', '订单号 $orderNo 已复制到剪贴板',
                  snackPosition: SnackPosition.TOP, duration: const Duration(seconds: 2));
              }
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.bgGray,
                borderRadius: BorderRadius.circular(AppSpacing.md),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('📋', style: TextStyle(fontSize: 14)),
                  SizedBox(width: 4),
                  Text('复制订单号', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProcessItem(Map<String, dynamic> node) {
    final pct = node['percent'] ?? 0;
    final isDone = pct >= 100;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(child: Text(node['name']?.toString() ?? '', style: const TextStyle(fontSize: 13, color: AppColors.textSecondary))),
              Text('$pct%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: isDone ? AppColors.success : AppColors.primary)),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: (pct / 100).clamp(0.0, 1.0),
              backgroundColor: AppColors.bgGray,
              valueColor: AlwaysStoppedAnimation<Color>(isDone ? AppColors.success : AppColors.primary),
              minHeight: 4,
            ),
          ),
        ],
      ),
    );
  }
}

class _Metric {
  final String value;
  final String label;
  final bool bold;
  final bool isDanger;
  const _Metric(this.value, this.label, {this.bold = false, this.isDanger = false});
}
