import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'admin_invite_controller.dart';

class AdminInvitePage extends GetView<AdminInviteController> {
  const AdminInvitePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AdminInvite')),
      body: const Center(child: Text('AdminInvite Page')),
    );
  }
}
