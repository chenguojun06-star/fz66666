import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'privacy_controller.dart';

class PrivacyPage extends GetView<PrivacyController> {
  const PrivacyPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Privacy')),
      body: const Center(child: Text('Privacy Page')),
    );
  }
}
