import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

class MpModal extends StatelessWidget {
  final String? title;
  final Widget child;
  final bool showClose;
  final double? width;
  final double maxHeight;

  const MpModal({
    super.key,
    this.title,
    required this.child,
    this.showClose = true,
    this.width,
    this.maxHeight = 0.7,
  });

  static Future<T?> show<T>({
    required BuildContext context,
    String? title,
    required Widget child,
    bool showClose = true,
  }) {
    return showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => MpModal(title: title, showClose: showClose, child: child),
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    return Container(
      constraints: BoxConstraints(maxHeight: screenHeight * maxHeight),
      width: width ?? double.infinity,
      decoration: const BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (title != null || showClose)
            Container(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
              child: Row(
                children: [
                  Expanded(child: Text(title ?? '', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.textPrimary))),
                  if (showClose)
                    GestureDetector(
                      onTap: () => Navigator.of(context).pop(),
                      child: const Icon(Icons.close, size: 24, color: AppColors.textTertiary),
                    ),
                ],
              ),
            ),
          Flexible(child: child),
          SizedBox(height: MediaQuery.of(context).padding.bottom + AppSpacing.lg),
        ],
      ),
    );
  }
}
