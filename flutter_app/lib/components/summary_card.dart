import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

class SummaryCard extends StatelessWidget {
  final String title;
  final List<SummaryItem> items;
  final Widget? trailing;

  const SummaryCard({
    super.key,
    required this.title,
    required this.items,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(AppSpacing.lg),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary))),
              ...?(trailing == null ? null : <Widget>[trailing!]),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          ...items.map((item) => Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: Row(
              children: [
                Expanded(child: Text(item.label, style: const TextStyle(fontSize: 14, color: AppColors.textSecondary))),
                Text(item.value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: item.color ?? AppColors.textPrimary)),
              ],
            ),
          )),
        ],
      ),
    );
  }
}

class SummaryItem {
  final String label;
  final String value;
  final Color? color;

  const SummaryItem({required this.label, required this.value, this.color});
}
