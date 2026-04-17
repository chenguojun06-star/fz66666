import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import 'privacy_controller.dart';

class PrivacyPage extends GetView<PrivacyController> {
  const PrivacyPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('隐私政策')),
      backgroundColor: AppColors.bgPage,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: const [
          Text('隐私政策', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
          SizedBox(height: AppSpacing.lg),
          Text('更新日期：2024年1月1日', style: TextStyle(fontSize: 13, color: AppColors.textTertiary)),
          SizedBox(height: AppSpacing.lg),
          Text('一、信息收集', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
          SizedBox(height: AppSpacing.sm),
          Text('我们仅收集为您提供服务所必需的信息，包括：账号信息（用户名、手机号）、生产数据（扫码记录、订单信息）、设备信息（设备型号、操作系统版本）。', style: TextStyle(fontSize: 14, color: AppColors.textSecondary), strutStyle: StrutStyle(height: 1.6)),
          SizedBox(height: AppSpacing.lg),
          Text('二、信息使用', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
          SizedBox(height: AppSpacing.sm),
          Text('您的信息仅用于：提供生产管理服务、改善用户体验、保障账户安全。我们不会将您的信息出售给第三方。', style: TextStyle(fontSize: 14, color: AppColors.textSecondary), strutStyle: StrutStyle(height: 1.6)),
          SizedBox(height: AppSpacing.lg),
          Text('三、信息安全', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
          SizedBox(height: AppSpacing.sm),
          Text('我们采用行业标准的安全措施保护您的信息，包括数据加密、访问控制、安全审计等。', style: TextStyle(fontSize: 14, color: AppColors.textSecondary), strutStyle: StrutStyle(height: 1.6)),
          SizedBox(height: AppSpacing.lg),
          Text('四、信息删除', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
          SizedBox(height: AppSpacing.sm),
          Text('您有权要求删除您的个人信息。如需删除，请联系管理员或在设置中提交删除请求。', style: TextStyle(fontSize: 14, color: AppColors.textSecondary), strutStyle: StrutStyle(height: 1.6)),
        ]),
      ),
    );
  }
}
