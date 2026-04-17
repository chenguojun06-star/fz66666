import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'scan_history_controller.dart';

class ScanHistoryPage extends GetView<ScanHistoryController> {
  const ScanHistoryPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ScanHistory')),
      body: const Center(child: Text('ScanHistory Page')),
    );
  }
}
