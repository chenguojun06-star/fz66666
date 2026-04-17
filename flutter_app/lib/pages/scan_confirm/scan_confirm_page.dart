import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'scan_confirm_controller.dart';

class ScanConfirmPage extends GetView<ScanConfirmController> {
  const ScanConfirmPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ScanConfirm')),
      body: const Center(child: Text('ScanConfirm Page')),
    );
  }
}
