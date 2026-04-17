import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../pages/work_ai/work_ai_page.dart';
import '../pages/work_ai/work_ai_controller.dart';

class GlobalAiAssistant extends StatefulWidget {
  final Widget child;
  const GlobalAiAssistant({super.key, required this.child});

  @override
  State<GlobalAiAssistant> createState() => _GlobalAiAssistantState();
}

class _GlobalAiAssistantState extends State<GlobalAiAssistant> {
  Offset position = const Offset(320, 500); // 初始位置
  bool isDragging = false;

  @override
  void initState() {
    super.initState();
    // 确保全局都能找到 WorkAiController
    if (!Get.isRegistered<WorkAiController>()) {
      Get.put(WorkAiController());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Material( // 添加 Material 确保文字和图标样式正确
      color: Colors.transparent,
      child: Overlay( // 添加 Overlay 解决 No Overlay widget found 报错
        initialEntries: [
          OverlayEntry(
            builder: (context) => Stack(
              children: [
                widget.child,
                _buildFloatingButton(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFloatingButton() {
    return Positioned(
      left: position.dx,
      top: position.dy,
      child: Draggable(
        feedback: _buildCloudIcon(isDragging: true),
        childWhenDragging: Container(),
        onDragStarted: () => setState(() => isDragging = true),
        onDragEnd: (details) {
          setState(() {
            isDragging = false;
            double x = details.offset.dx;
            double y = details.offset.dy;
            if (x < 0) x = 0;
            if (x > Get.width - 65) x = Get.width - 65;
            if (y < 80) y = 80;
            if (y > Get.height - 100) y = Get.height - 100;
            position = Offset(x, y);
          });
        },
        child: GestureDetector(
          onTap: _showAiDialog,
          child: _buildCloudIcon(),
        ),
      ),
    );
  }

  Widget _buildCloudIcon({bool isDragging = false}) {
    return Material(
      color: Colors.transparent,
      child: Container(
        width: 65,
        height: 65,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isDragging ? 0.3 : 0.1),
              blurRadius: 10,
              spreadRadius: 2,
              offset: const Offset(0, 4),
            ),
          ],
          border: Border.all(color: Colors.blue.shade100, width: 2),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            // 代码绘制简单云朵
            Icon(Icons.cloud, size: 45, color: Colors.blue.shade300),
            const Positioned(
              top: 22,
              child: Row(
                children: [
                  CircleAvatar(radius: 2, backgroundColor: Colors.black),
                  SizedBox(width: 8),
                  CircleAvatar(radius: 2, backgroundColor: Colors.black),
                ],
              ),
            ),
            Positioned(
              top: 30,
              child: Container(
                width: 12,
                height: 6,
                decoration: BoxDecoration(
                  border: Border(bottom: BorderSide(color: Colors.black, width: 1.5)),
                  borderRadius: const BorderRadius.vertical(bottom: Radius.circular(10)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showAiDialog() {
    Get.bottomSheet(
      const ClipRRect(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        child: SizedBox(
          height: 600,
          child: WorkAiPage(),
        ),
      ),
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
    );
  }
}
