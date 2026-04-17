import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import 'login_controller.dart';

class LoginPage extends GetView<LoginController> {
  const LoginPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgPage,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 40),
              Center(
                child: Column(
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Icon(Icons.cloud_outlined, size: 40, color: AppColors.primary),
                    ),
                    const SizedBox(height: 16),
                    const Text('衣智链', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                    const SizedBox(height: 4),
                    Text('有问题找小云｜多端协同更轻松', style: TextStyle(fontSize: 14, color: AppColors.textSecondary)),
                  ],
                ),
              ),
              const SizedBox(height: 40),

              Obx(() => _buildTenantField()),
              const SizedBox(height: 16),

              Obx(() => TextField(
                onChanged: (v) => controller.username.value = v,
                decoration: InputDecoration(
                  hintText: '请输入用户名',
                  prefixIcon: const Icon(Icons.person_outline, size: 20),
                  filled: true,
                  fillColor: AppColors.bgCard,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.border)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.border)),
                ),
                enabled: !controller.loading.value,
              )),
              const SizedBox(height: 16),

              Obx(() => TextField(
                onChanged: (v) => controller.password.value = v,
                obscureText: !controller.showPassword.value,
                decoration: InputDecoration(
                  hintText: '请输入密码',
                  prefixIcon: const Icon(Icons.lock_outline, size: 20),
                  suffixIcon: GestureDetector(
                    onTap: controller.togglePassword,
                    child: Icon(controller.showPassword.value ? Icons.visibility : Icons.visibility_off, size: 20, color: AppColors.textTertiary),
                  ),
                  filled: true,
                  fillColor: AppColors.bgCard,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.border)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.border)),
                ),
                enabled: !controller.loading.value,
              )),
              const SizedBox(height: 32),

              Obx(() => SizedBox(
                width: double.infinity,
                height: 44,
                child: ElevatedButton(
                  onPressed: (controller.loading.value || controller.selectedTenantId.value.isEmpty)
                      ? null
                      : controller.onLogin,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.5),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  child: controller.loading.value
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('登录', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w500)),
                ),
              )),
              const SizedBox(height: 16),

              Center(
                child: GestureDetector(
                  onTap: controller.goToRegister,
                  child: RichText(
                    text: TextSpan(
                      text: '没有账号？',
                      style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
                      children: [TextSpan(text: '立即注册', style: TextStyle(fontSize: 14, color: AppColors.primary, fontWeight: FontWeight.w500))],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTenantField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          onChanged: controller.onTenantSearch,
          controller: TextEditingController(text: controller.tenantSearchText.value)
            ..selection = TextSelection.fromPosition(TextPosition(offset: controller.tenantSearchText.value.length)),
          decoration: InputDecoration(
            hintText: controller.tenantsLoading.value ? '加载中...' : '搜索公司名称',
            prefixIcon: const Icon(Icons.search, size: 20),
            suffixIcon: Obx(() => controller.selectedTenantName.value.isNotEmpty
                ? GestureDetector(onTap: controller.onClearTenant, child: Icon(Icons.close, size: 18, color: AppColors.textTertiary))
                : const SizedBox.shrink()),
            filled: true,
            fillColor: AppColors.bgCard,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.border)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.border)),
          ),
        ),
        Obx(() {
          if (controller.selectedTenantName.value.isNotEmpty) {
            return Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('已选择: ${controller.selectedTenantName.value}', style: TextStyle(fontSize: 12, color: AppColors.success)),
            );
          }
          return const SizedBox.shrink();
        }),
        Obx(() {
          if (!controller.showTenantResults.value) return const SizedBox.shrink();
          if (controller.filteredTenants.isEmpty) {
            return Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.bgCard, borderRadius: BorderRadius.circular(8), border: Border.all(color: AppColors.borderLight)),
              child: Text('未找到匹配的公司', style: TextStyle(fontSize: 14, color: AppColors.textTertiary)),
            );
          }
          return Container(
            margin: const EdgeInsets.only(top: 4),
            constraints: const BoxConstraints(maxHeight: 200),
            decoration: BoxDecoration(color: AppColors.bgCard, borderRadius: BorderRadius.circular(8), border: Border.all(color: AppColors.borderLight)),
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: controller.filteredTenants.length,
              itemBuilder: (_, i) => InkWell(
                onTap: () => controller.onTenantSelect(i),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: Text(controller.filteredTenants[i]['tenantName']?.toString() ?? '', style: const TextStyle(fontSize: 15)),
                ),
              ),
            ),
          );
        }),
      ],
    );
  }
}
