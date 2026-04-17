import 'package:flutter/material.dart';
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
    final progress = (order['productionProgress'] ?? 0) as num;
    final orderNo = order['orderNo']?.toString() ?? '-';
    final styleNo = order['styleNo']?.toString() ?? '-';
    final processName = order['currentProcessName']?.toString() ?? '';
    final factoryName = order['factoryName']?.toString() ?? '-';
    final orderId = order['id']?.toString() ?? '';
    final isOverdue = order['overdue'] == true;
    final isExpanded = controller.expandedOrderId.value == orderId;

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
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            Text(orderNo, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                            if (isOverdue) ...[
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                decoration: BoxDecoration(
                                  color: AppColors.tagBgRed,
                                  borderRadius: BorderRadius.circular(AppSpacing.xs),
                                ),
                                child: const Text('延期', style: TextStyle(fontSize: 10, color: AppColors.error)),
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (processName.isNotEmpty)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: _getProcessTagBg(processName),
                            borderRadius: BorderRadius.circular(AppSpacing.sm),
                          ),
                          child: Text(processName, style: TextStyle(fontSize: 11, color: _getProcessTagColor(processName))),
                        ),
                      const SizedBox(width: 4),
                      Icon(isExpanded ? Icons.expand_less : Icons.expand_more, size: 20, color: AppColors.textTertiary),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('$styleNo · $factoryName', style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(AppSpacing.lg),
                          child: LinearProgressIndicator(
                            value: progress.toDouble() / 100,
                            backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                            valueColor: AlwaysStoppedAnimation<Color>(
                              progress >= 100 ? AppColors.success : AppColors.primary,
                            ),
                            minHeight: 6,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text('${progress.toInt()}%', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (isExpanded) _buildBundleList(orderId),
        ],
      ),
    );
  }

  Widget _buildBundleList(String orderId) {
    final bundles = controller.orderBundles[orderId] ?? [];
    return Container(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.borderLight)),
      ),
      child: controller.loadingBundles.value
          ? const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
            )
          : bundles.isEmpty
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: Text('暂无菲号数据', style: TextStyle(fontSize: 13, color: AppColors.textTertiary))),
                )
              : Column(
                  children: bundles.map((bundle) {
                    final bundleNo = bundle['bundleNo']?.toString() ?? '-';
                    final status = bundle['status']?.toString() ?? '';
                    final processName = bundle['currentProcessName']?.toString() ?? '';
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
                      decoration: const BoxDecoration(
                        border: Border(bottom: BorderSide(color: AppColors.borderLight)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.content_cut, size: 16, color: AppColors.textTertiary),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('菲号 $bundleNo', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.textPrimary)),
                                if (processName.isNotEmpty)
                                  Text(processName, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                              ],
                            ),
                          ),
                          if (status.isNotEmpty)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                              decoration: BoxDecoration(
                                color: _getStatusBg(status),
                                borderRadius: BorderRadius.circular(AppSpacing.xs),
                              ),
                              child: Text(status, style: TextStyle(fontSize: 10, color: _getStatusColor(status))),
                            ),
                          PopupMenuButton<String>(
                            icon: const Icon(Icons.more_vert, size: 18, color: AppColors.textTertiary),
                            onSelected: (action) => controller.onBundleAction(action, bundle),
                            itemBuilder: (_) => [
                              const PopupMenuItem(value: 'split', child: Text('分扎转移')),
                              const PopupMenuItem(value: 'rollback', child: Text('回退')),
                            ],
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
    );
  }

  Color _getProcessTagBg(String name) {
    if (name.contains('裁剪')) return AppColors.tagBgOrange;
    if (name.contains('车缝') || name.contains('缝制')) return AppColors.tagBgBlue;
    if (name.contains('质检') || name.contains('检验')) return AppColors.tagBgGreen;
    if (name.contains('入库') || name.contains('包装')) return AppColors.tagBgGreen;
    return AppColors.tagBgBlue;
  }

  Color _getProcessTagColor(String name) {
    if (name.contains('裁剪')) return AppColors.warning;
    if (name.contains('车缝') || name.contains('缝制')) return AppColors.info;
    if (name.contains('质检') || name.contains('检验')) return AppColors.success;
    if (name.contains('入库') || name.contains('包装')) return AppColors.success;
    return AppColors.info;
  }

  Color _getStatusBg(String status) {
    if (status.contains('完成') || status.contains('入库')) return AppColors.tagBgGreen;
    if (status.contains('延期') || status.contains('异常')) return AppColors.tagBgRed;
    return AppColors.tagBgBlue;
  }

  Color _getStatusColor(String status) {
    if (status.contains('完成') || status.contains('入库')) return AppColors.success;
    if (status.contains('延期') || status.contains('异常')) return AppColors.error;
    return AppColors.info;
  }
}
