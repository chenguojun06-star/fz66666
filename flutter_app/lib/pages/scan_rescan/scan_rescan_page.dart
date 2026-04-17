import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'scan_rescan_controller.dart';

class ScanRescanPage extends GetView<ScanRescanController> {
  const ScanRescanPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ScanRescan')),
      body: const Center(child: Text('ScanRescan Page')),
    );
  }
}
