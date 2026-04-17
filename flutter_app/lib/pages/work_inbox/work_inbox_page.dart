import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'work_inbox_controller.dart';

class WorkInboxPage extends GetView<WorkInboxController> {
  const WorkInboxPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('WorkInbox')),
      body: const Center(child: Text('WorkInbox Page')),
    );
  }
}
