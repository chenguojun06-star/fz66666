import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'procurement_controller.dart';

class ProcurementPage extends GetView<ProcurementController> {
  const ProcurementPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Procurement')),
      body: const Center(child: Text('Procurement Page')),
    );
  }
}
