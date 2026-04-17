import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'bundle_split_controller.dart';

class BundleSplitPage extends GetView<BundleSplitController> {
  const BundleSplitPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('BundleSplit')),
      body: const Center(child: Text('BundleSplit Page')),
    );
  }
}
