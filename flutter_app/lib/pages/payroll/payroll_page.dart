import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'payroll_controller.dart';

class PayrollPage extends GetView<PayrollController> {
  const PayrollPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payroll')),
      body: const Center(child: Text('Payroll Page')),
    );
  }
}
