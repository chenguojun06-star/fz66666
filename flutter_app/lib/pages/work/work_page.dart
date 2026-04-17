import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../components/empty_state.dart';
import '../../components/load_more.dart';
import 'work_controller.dart';

class WorkPage extends GetView<WorkController> {
  const WorkPage({super.key});

  @override
  Widget build(BuildContext context) {
    Get.put(WorkController());
    return Scaffold(
      backgroundColor: AppColors.bgPage,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
              child: TextField(
                onChanged: controller.onSearchChanged,
                decoration: InputDecoration(
                  hintText: '搜索订单号/款号',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: Obx(() => controller.hasSearched.value
                      ? IconButton(icon: const Icon(Icons.close, size: 18), onPressed: controller.clearSearch)
                      : const SizedBox.shrink()),
                  filled: true,
                  fillColor: AppColors.bgCard,
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(vertical: 8),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.border)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.border)),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, 0),
              child: Obx(() => _buildFilterRow()),
            ),
            Obx(() => _buildTabBar()),
            Expanded(
              child: Obx(() => controller.hasSearched.value ? _buildSearchResults() : _buildOrderList()),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterRow() {
    return Row(
      children: [
        Expanded(
          child: GestureDetector(
            onTap: () => _showFactoryPicker(),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.bgCard,
                borderRadius: BorderRadius.circular(AppSpacing.md),
                border: Border.all(color: AppColors.borderLight),
              ),
              child: Row(
                children: [
                  const Icon(Icons.factory, size: 14, color: AppColors.textSecondary),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      controller.selectedFactoryId.value.isEmpty
                          ? '全部工厂'
                          : controller.factories.firstWhere(
                              (f) => f['id']?.toString() == controller.selectedFactoryId.value,
                              orElse: () => {'name': '选择工厂'},
                            )['name']?.toString() ?? '选择工厂',
                      style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const Icon(Icons.arrow_drop_down, size: 16, color: AppColors.textTertiary),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        GestureDetector(
          onTap: controller.toggleOverdueFilter,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: controller.showOverdueOnly.value ? AppColors.tagBgRed : AppColors.bgCard,
              borderRadius: BorderRadius.circular(AppSpacing.md),
              border: Border.all(color: controller.showOverdueOnly.value ? AppColors.error : AppColors.borderLight),
            ),
            child: Row(
              children: [
                Icon(Icons.warning_amber, size: 14, color: controller.showOverdueOnly.value ? AppColors.error : AppColors.textSecondary),
                const SizedBox(width: 4),
                Text('延期',
                  style: TextStyle(fontSize: 12, color: controller.showOverdueOnly.value ? AppColors.error : AppColors.textSecondary)),
              ],
            ),
          ),
        ),
      ],
    );
  }

  void _showFactoryPicker() {
    final items = [
      {'id': '', 'name': '全部工厂'},
      ...controller.factories,
    ];
    Get.bottomSheet(
      Container(
        decoration: const BoxDecoration(
          color: AppColors.bgCard,
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(padding: EdgeInsets.all(16), child: Text('选择工厂', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600))),
            const Divider(height: 1),
            ...items.map((f) => ListTile(
              title: Text(f['name']?.toString() ?? '', style: const TextStyle(fontSize: 15)),
              trailing: f['id']?.toString() == controller.selectedFactoryId.value
                  ? const Icon(Icons.check, color: AppColors.primary)
                  : null,
              onTap: () {
                controller.onFactoryFilter(f['id']?.toString() ?? '');
                Get.back();
              },
            )),
            SizedBox(height: Get.mediaQuery.padding.bottom + 16),
          ],
        ),
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      height: 44,
      margin: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.bgGray,
        borderRadius: BorderRadius.circular(AppSpacing.md),
      ),
      child: Row(
        children: controller.tabs.map((tab) {
          final isActive = controller.activeTab.value == tab['key'];
          return Expanded(
            child: GestureDetector(
              onTap: () => controller.onTab(tab['key'] as String),
              child: Container(
                decoration: BoxDecoration(
                  color: isActive ? AppColors.bgCard : Colors.transparent,
                  borderRadius: BorderRadius.circular(AppSpacing.md),
                  boxShadow: isActive ? [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 2)] : [],
                ),
                alignment: Alignment.center,
                child: Text(tab['label'] as String,
                  style: TextStyle(fontSize: 14, fontWeight: isActive ? FontWeight.w600 : FontWeight.normal, color: isActive ? AppColors.primary : AppColors.textSecondary)),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildSearchResults() {
    if (controller.searchResults.isEmpty) {
      return const EmptyState(iconData: Icons.search_off, title: '未找到相关订单', subtitle: '请尝试其他关键词');
    }
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      itemCount: controller.searchResults.length,
      itemBuilder: (_, i) => _buildOrderCard(controller.searchResults[i]),
    );
  }

  Widget _buildOrderList() {
    if (controller.loading.value && controller.orders.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (controller.orders.isEmpty) {
      return const EmptyState(iconData: Icons.inbox, title: '暂无订单数据', subtitle: '下拉刷新或切换筛选条件');
    }
    return RefreshIndicator(
      onRefresh: () => controller.loadOrders(reset: true),
      child: NotificationListener<ScrollNotification>(
        onNotification: (notification) {
          if (notification is ScrollEndNotification && notification.metrics.pixels >= notification.metrics.maxScrollExtent - 100) {
            controller.loadOrders();
          }
          return false;
        },
        child: ListView.builder(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          itemCount: controller.orders.length + 1,
          itemBuilder: (_, i) {
            if (i == controller.orders.length) {
              return Obx(() => LoadMore(
                status: controller.hasMore.value
                    ? (controller.loading.value ? LoadMoreStatus.loading : LoadMoreStatus.idle)
                    : LoadMoreStatus.noMore,
                onLoadMore: () => controller.loadOrders(),
              ));
            }
            return _buildOrderCard(controller.orders[i]);
          },
        ),
      ),
    );
  }

  Widget _buildOrderCard(Map<String, dynamic> order) {
    final orderId = order['id']?.toString() ?? '';
    final isExpanded = controller.expandedOrderId.value == orderId;
    final isOverdue = order['remainDaysClass'] == 'days-overdue';
    final progress = order['calculatedProgress'] ?? 0;
    final coverUrl = order['styleCoverUrl']?.toString() ?? '';

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
            onTap: () => controller.toggleOrderExpand(orderId),
            borderRadius: BorderRadius.circular(AppSpacing.lg),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                children: [
                  _buildOrderHeader(order, coverUrl, isOverdue),
                  const SizedBox(height: AppSpacing.sm),
                  _buildQtyRow(order),
                  const SizedBox(height: AppSpacing.sm),
                  _buildProgressRow(order, progress, isExpanded),
                ],
              ),
            ),
          ),
          if (isExpanded) _buildExpandedBody(order, orderId),
        ],
      ),
    );
  }

  Widget _buildOrderHeader(Map<String, dynamic> order, String coverUrl, bool isOverdue) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            color: AppColors.bgGray,
            borderRadius: BorderRadius.circular(AppSpacing.md),
          ),
          child: coverUrl.isNotEmpty
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(AppSpacing.md),
                  child: Image.network(coverUrl, fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const Center(child: Text('👔', style: TextStyle(fontSize: 22))),
                  ),
                )
              : const Center(child: Text('👔', style: TextStyle(fontSize: 22))),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(order['orderNo']?.toString() ?? '-', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.textPrimary))),
                  if (isOverdue || order['remainDaysClass'] == 'days-soon') ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: isOverdue ? AppColors.tagBgRed : AppColors.tagBgOrange,
                        borderRadius: BorderRadius.circular(AppSpacing.xs),
                      ),
                      child: Text(order['remainDaysText']?.toString() ?? '延期',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: isOverdue ? AppColors.error : AppColors.warning)),
                    ),
                  ],
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
              if (order['currentProcessName'] != null) ...[
                const SizedBox(height: 2),
                Text(order['currentProcessName'].toString(), style: const TextStyle(fontSize: 11, color: AppColors.primary)),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildQtyRow(Map<String, dynamic> order) {
    final total = order['cuttingQty'] ?? order['totalQuantity'] ?? order['orderQuantity'] ?? 0;
    final completed = order['completedQuantity'] ?? 0;
    final remain = order['remainQuantity'] ?? 0;
    return Row(
      children: [
        _qtyItem('$total', '总数量'),
        Container(width: 1, height: 18, color: AppColors.borderLight, margin: const EdgeInsets.symmetric(horizontal: 10)),
        _qtyItem('$completed', '已完成'),
        Container(width: 1, height: 18, color: AppColors.borderLight, margin: const EdgeInsets.symmetric(horizontal: 10)),
        _qtyItem('$remain', '剩余'),
      ],
    );
  }

  Widget _qtyItem(String val, String label) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(val, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
        Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textTertiary)),
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
                order['remainDaysClass'] == 'days-overdue' ? AppColors.error : (progress >= 100 ? AppColors.success : AppColors.primary),
              ),
              minHeight: 5,
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

  Widget _buildExpandedBody(Map<String, dynamic> order, String orderId) {
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
            const Text('工序进度', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
            const SizedBox(height: AppSpacing.sm),
            ...processNodes.map((node) => _buildProcessItem(node)),
          ],
          const SizedBox(height: AppSpacing.md),
          _buildBundleSection(orderId),
          const SizedBox(height: AppSpacing.sm),
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
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: AppColors.bgGray,
                borderRadius: BorderRadius.circular(AppSpacing.md),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('📋', style: TextStyle(fontSize: 13)),
                  SizedBox(width: 4),
                  Text('复制订单号', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
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
              Expanded(child: Text(node['name']?.toString() ?? '', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary))),
              Text('$pct%', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isDone ? AppColors.success : AppColors.primary)),
            ],
          ),
          const SizedBox(height: 3),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: (pct / 100).clamp(0.0, 1.0),
              backgroundColor: AppColors.bgGray,
              valueColor: AlwaysStoppedAnimation<Color>(isDone ? AppColors.success : AppColors.primary),
              minHeight: 3,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBundleSection(String orderId) {
    final bundles = controller.orderBundles[orderId] ?? [];
    if (controller.loadingBundles.value) {
      return const Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)));
    }
    if (bundles.isEmpty) {
      return const Text('暂无菲号数据', style: TextStyle(fontSize: 12, color: AppColors.textTertiary));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('菲号列表', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
        const SizedBox(height: AppSpacing.sm),
        ...bundles.map((bundle) {
          final bundleNo = bundle['bundleNo']?.toString() ?? '-';
          final processName = bundle['currentProcessName']?.toString() ?? '';
          final status = bundle['status']?.toString() ?? '';
          return Container(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.borderLight)),
            ),
            child: Row(
              children: [
                const Icon(Icons.content_cut, size: 14, color: AppColors.textTertiary),
                const SizedBox(width: 6),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('菲号 $bundleNo', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
                      if (processName.isNotEmpty)
                        Text(processName, style: const TextStyle(fontSize: 10, color: AppColors.textSecondary)),
                    ],
                  ),
                ),
                if (status.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: status.contains('完成') ? AppColors.tagBgGreen : AppColors.tagBgBlue,
                      borderRadius: BorderRadius.circular(AppSpacing.xs),
                    ),
                    child: Text(status, style: TextStyle(fontSize: 9, color: status.contains('完成') ? AppColors.success : AppColors.info)),
                  ),
                PopupMenuButton<String>(
                  icon: const Icon(Icons.more_vert, size: 16, color: AppColors.textTertiary),
                  onSelected: (action) => controller.onBundleAction(action, bundle),
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: 'split', child: Text('分扎转移')),
                    const PopupMenuItem(value: 'rollback', child: Text('回退')),
                  ],
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}
