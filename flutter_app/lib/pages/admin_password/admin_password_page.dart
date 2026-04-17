import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'admin_password_controller.dart';

class AdminPasswordPage extends GetView<AdminPasswordController> {
  const AdminPasswordPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AdminPassword')),
      body: const Center(child: Text('AdminPassword Page')),
    );
  }
}
