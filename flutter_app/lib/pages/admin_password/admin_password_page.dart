import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import 'admin_password_controller.dart';

class AdminPasswordPage extends GetView<AdminPasswordController> {
  const AdminPasswordPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('修改密码')),
      backgroundColor: AppColors.bgPage,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          children: [
            TextField(
              onChanged: (v) => controller.oldPassword.value = v,
              obscureText: true,
              decoration: const InputDecoration(hintText: '当前密码', prefixIcon: Icon(Icons.lock_outline, size: 20)),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              onChanged: (v) => controller.newPassword.value = v,
              obscureText: true,
              decoration: const InputDecoration(hintText: '新密码（至少6位）', prefixIcon: Icon(Icons.lock_outline, size: 20)),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              onChanged: (v) => controller.confirmPassword.value = v,
              obscureText: true,
              decoration: const InputDecoration(hintText: '确认新密码', prefixIcon: Icon(Icons.lock_outline, size: 20)),
            ),
            const SizedBox(height: AppSpacing.xxl),
            Obx(() => SizedBox(
              width: double.infinity,
              height: 44,
              child: ElevatedButton(
                onPressed: controller.loading.value ? null : controller.changePassword,
                child: controller.loading.value
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('确认修改'),
              ),
            )),
          ],
        ),
      ),
    );
  }
}
