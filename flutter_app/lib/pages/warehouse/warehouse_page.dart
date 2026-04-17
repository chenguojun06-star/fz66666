import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'warehouse_controller.dart';

class WarehousePage extends GetView<WarehouseController> {
  const WarehousePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Warehouse')),
      body: const Center(child: Text('Warehouse Page')),
    );
  }
}
