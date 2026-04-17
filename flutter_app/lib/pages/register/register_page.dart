import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import 'register_controller.dart';

class RegisterPage extends GetView<RegisterController> {
  const RegisterPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('注册')),
      backgroundColor: AppColors.bgPage,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Obx(() => _buildTenantSelector()),
            const SizedBox(height: AppSpacing.md),
            Obx(() => _buildRoleSelector()),
            const SizedBox(height: AppSpacing.md),
            TextField(
              onChanged: (v) => controller.phone.value = v,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(hintText: '手机号', prefixIcon: Icon(Icons.phone_outlined, size: 20)),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              onChanged: (v) => controller.realName.value = v,
              decoration: const InputDecoration(hintText: '真实姓名', prefixIcon: Icon(Icons.person_outline, size: 20)),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              onChanged: (v) => controller.password.value = v,
              obscureText: true,
              decoration: const InputDecoration(hintText: '密码', prefixIcon: Icon(Icons.lock_outline, size: 20)),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              onChanged: (v) => controller.confirmPassword.value = v,
              obscureText: true,
              decoration: const InputDecoration(hintText: '确认密码', prefixIcon: Icon(Icons.lock_outline, size: 20)),
            ),
            const SizedBox(height: AppSpacing.xxl),
            Obx(() => SizedBox(
              width: double.infinity,
              height: 44,
              child: ElevatedButton(
                onPressed: controller.loading.value ? null : controller.onRegister,
                child: controller.loading.value
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('注册'),
              ),
            )),
          ],
        ),
      ),
    );
  }

  Widget _buildTenantSelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          onChanged: controller.onTenantSearch,
          decoration: InputDecoration(
            hintText: controller.selectedTenantName.value.isNotEmpty ? controller.selectedTenantName.value : '搜索公司',
            prefixIcon: const Icon(Icons.search, size: 20),
          ),
        ),
        if (controller.selectedTenantName.value.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('已选择: ${controller.selectedTenantName.value}', style: const TextStyle(fontSize: 12, color: AppColors.success)),
          ),
        if (controller.selectedTenantId.value.isEmpty && controller.filteredTenants.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 4),
            constraints: const BoxConstraints(maxHeight: 150),
            decoration: BoxDecoration(color: AppColors.bgCard, borderRadius: BorderRadius.circular(8), border: Border.all(color: AppColors.borderLight)),
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: controller.filteredTenants.length,
              itemBuilder: (_, i) => InkWell(
                onTap: () => controller.selectTenant(controller.filteredTenants[i]),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Text(controller.filteredTenants[i]['tenantName']?.toString() ?? ''),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildRoleSelector() {
    if (controller.roles.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 8,
      children: controller.roles.map((role) {
        final isSelected = controller.selectedRoleCode.value == role['roleCode']?.toString();
        return ChoiceChip(
          label: Text(role['roleName']?.toString() ?? ''),
          selected: isSelected,
          onSelected: (_) => controller.selectRole(role),
        );
      }).toList(),
    );
  }
}
