import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'admin_approval_controller.dart';

class AdminApprovalPage extends GetView<AdminApprovalController> {
  const AdminApprovalPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AdminApproval')),
      body: const Center(child: Text('AdminApproval Page')),
    );
  }
}
