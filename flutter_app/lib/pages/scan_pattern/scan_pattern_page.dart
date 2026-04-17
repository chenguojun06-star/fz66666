import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'scan_pattern_controller.dart';

class ScanPatternPage extends GetView<ScanPatternController> {
  const ScanPatternPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ScanPattern')),
      body: const Center(child: Text('ScanPattern Page')),
    );
  }
}
