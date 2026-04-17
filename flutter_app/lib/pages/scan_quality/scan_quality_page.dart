import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'scan_quality_controller.dart';

class ScanQualityPage extends GetView<ScanQualityController> {
  const ScanQualityPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ScanQuality')),
      body: const Center(child: Text('ScanQuality Page')),
    );
  }
}
