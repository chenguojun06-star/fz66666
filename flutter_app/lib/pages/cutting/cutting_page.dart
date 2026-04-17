import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'cutting_controller.dart';

class CuttingPage extends GetView<CuttingController> {
  const CuttingPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cutting')),
      body: const Center(child: Text('Cutting Page')),
    );
  }
}
