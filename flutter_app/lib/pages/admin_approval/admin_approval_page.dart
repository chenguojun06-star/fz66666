import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'admin_approval_controller.dart';

class AdminApprovalPage extends GetView<AdminApprovalController> {
  const AdminApprovalPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('管理员审批', style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: true,
        elevation: 0,
        backgroundColor: Theme.of(context).primaryColor,
        foregroundColor: Colors.white,
      ),
      body: Obx(() {
        if (controller.isLoading.value && controller.pendingUsers.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }

        if (controller.pendingUsers.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.person_search, size: 80, color: Colors.grey[300]),
                const SizedBox(height: 16),
                Text('暂无待审批申请', style: TextStyle(color: Colors.grey[600], fontSize: 16)),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: controller.fetchPendingUsers,
                  child: const Text('点击刷新'),
                ),
              ],
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: controller.fetchPendingUsers,
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: controller.pendingUsers.length,
            itemBuilder: (context, index) {
              final user = controller.pendingUsers[index];
              final String username = user['username'] ?? '未知用户';
              final String realName = user['realName'] ?? '未填写姓名';
              final String userId = user['id']?.toString() ?? '';

              return Card(
                elevation: 2,
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: Theme.of(context).primaryColor.withOpacity(0.1),
                            child: Text(realName.characters.first,
                              style: TextStyle(color: Theme.of(context).primaryColor, fontWeight: FontWeight.bold)),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(realName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                                Text('账号: $username', style: TextStyle(color: Colors.grey[600], fontSize: 14)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          OutlinedButton(
                            onPressed: () => _confirmReject(context, userId),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.red,
                              side: const BorderSide(color: Colors.red),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            child: const Text('拒绝'),
                          ),
                          const SizedBox(width: 12),
                          ElevatedButton(
                            onPressed: () => controller.approve(userId),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.green,
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                              elevation: 0,
                            ),
                            child: const Text('通过'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      }),
    );
  }

  void _confirmReject(BuildContext context, String userId) {
    Get.dialog(
      AlertDialog(
        title: const Text('确认拒绝'),
        content: const Text('确定要拒绝该用户的入驻申请吗？'),
        actions: [
          TextButton(onPressed: () => Get.back(), child: const Text('取消')),
          TextButton(
            onPressed: () {
              Get.back();
              controller.reject(userId);
            },
            child: const Text('确定拒绝', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}
