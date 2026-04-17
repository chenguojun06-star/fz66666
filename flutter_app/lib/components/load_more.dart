import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

enum LoadMoreStatus { idle, loading, noMore, error }

class LoadMore extends StatelessWidget {
  final LoadMoreStatus status;
  final VoidCallback? onLoadMore;
  final String loadingText;
  final String noMoreText;
  final String errorText;

  const LoadMore({
    super.key,
    required this.status,
    this.onLoadMore,
    this.loadingText = '加载中...',
    this.noMoreText = '没有更多了',
    this.errorText = '加载失败，点击重试',
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: status == LoadMoreStatus.error ? onLoadMore : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
        child: Center(
          child: _buildContent(),
        ),
      ),
    );
  }

  Widget _buildContent() {
    switch (status) {
      case LoadMoreStatus.loading:
        return Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary.withValues(alpha: 0.6))),
            const SizedBox(width: 8),
            Text(loadingText, style: const TextStyle(fontSize: 13, color: AppColors.textTertiary)),
          ],
        );
      case LoadMoreStatus.noMore:
        return Text(noMoreText, style: const TextStyle(fontSize: 13, color: AppColors.textTertiary));
      case LoadMoreStatus.error:
        return Text(errorText, style: const TextStyle(fontSize: 13, color: AppColors.error));
      case LoadMoreStatus.idle:
        return const SizedBox.shrink();
    }
  }
}
