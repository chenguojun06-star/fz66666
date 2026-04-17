import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'scan_result_controller.dart';

class ScanResultPage extends GetView<ScanResultController> {
  const ScanResultPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ScanResult')),
      body: const Center(child: Text('ScanResult Page')),
    );
  }
}
