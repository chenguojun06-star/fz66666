import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'admin_feedback_controller.dart';

class AdminFeedbackPage extends GetView<AdminFeedbackController> {
  const AdminFeedbackPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AdminFeedback')),
      body: const Center(child: Text('AdminFeedback Page')),
    );
  }
}
