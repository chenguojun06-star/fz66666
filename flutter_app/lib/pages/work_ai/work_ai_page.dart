import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'work_ai_controller.dart';

class WorkAiPage extends GetView<WorkAiController> {
  const WorkAiPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('WorkAi')),
      body: const Center(child: Text('WorkAi Page')),
    );
  }
}
