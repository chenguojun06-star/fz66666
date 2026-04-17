import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../theme/app_colors.dart';
import '../pages/work_ai/work_ai_page.dart';
import '../pages/work_ai/work_ai_controller.dart';

class GlobalAiAssistant extends StatefulWidget {
  final Widget child;
  const GlobalAiAssistant({super.key, required this.child});

  @override
  State<GlobalAiAssistant> createState() => _GlobalAiAssistantState();
}

class _GlobalAiAssistantState extends State<GlobalAiAssistant> with TickerProviderStateMixin {
  Offset position = const Offset(320, 500);
  bool isDragging = false;
  late AnimationController _pulseController;
  late AnimationController _breathController;

  @override
  void initState() {
    super.initState();
    if (!Get.isRegistered<WorkAiController>()) {
      Get.put(WorkAiController());
    }
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    _breathController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _breathController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Overlay(
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
        feedback: _buildCloudAvatar(isDragging: true),
        childWhenDragging: Container(),
        onDragStarted: () => setState(() => isDragging = true),
        onDragEnd: (details) {
          setState(() {
            isDragging = false;
            double x = details.offset.dx;
            double y = details.offset.dy;
            if (x < 0) x = 0;
            if (x > Get.width - 68) x = Get.width - 68;
            if (y < 80) y = 80;
            if (y > Get.height - 100) y = Get.height - 100;
            position = Offset(x, y);
          });
        },
        child: GestureDetector(
          onTap: _showAiDialog,
          child: _buildCloudAvatar(),
        ),
      ),
    );
  }

  Widget _buildCloudAvatar({bool isDragging = false}) {
    return AnimatedBuilder(
      animation: Listenable.merge([_pulseController, _breathController]),
      builder: (context, child) {
        final pulseScale = 1.0 + _pulseController.value * 0.03;
        final breathOffset = _breathController.value * 1.5;

        return Transform.translate(
          offset: Offset(0, breathOffset),
          child: Transform.scale(
            scale: isDragging ? 1.1 : pulseScale,
            child: SizedBox(
              width: 68,
              height: 68,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  _buildPulseRing(),
                  Container(
                    width: 60,
                    height: 60,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        colors: [Color(0xFF4F8EFF), AppColors.primary, Color(0xFF6366F1)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.primary.withValues(alpha: isDragging ? 0.5 : 0.25),
                          blurRadius: isDragging ? 16 : 10,
                          spreadRadius: isDragging ? 2 : 0,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: CustomPaint(
                      painter: CloudFacePainter(
                        breathProgress: _breathController.value,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildPulseRing() {
    final progress = _pulseController.value;
    return Container(
      width: 60 + progress * 12,
      height: 60 + progress * 12,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: AppColors.primary.withValues(alpha: 0.15 * (1 - progress)),
          width: 2,
        ),
      ),
    );
  }

  void _showAiDialog() {
    Get.bottomSheet(
      Container(
        decoration: const BoxDecoration(
          color: AppColors.bgCard,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Row(
                children: [
                  const SizedBox(width: 16),
                  SizedBox(
                    width: 36,
                    height: 36,
                    child: CustomPaint(
                      painter: CloudFacePainter(breathProgress: 0.5),
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('小云 AI 助手', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                        Text('随时为你解答生产管理问题', style: TextStyle(fontSize: 12, color: AppColors.textTertiary)),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Get.back(),
                    icon: const Icon(Icons.close, size: 22, color: AppColors.textTertiary),
                  ),
                  const SizedBox(width: 8),
                ],
              ),
            ),
            const Divider(height: 1),
            const SizedBox(
              height: 520,
              child: WorkAiPage(),
            ),
          ],
        ),
      ),
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
    );
  }
}

class CloudFacePainter extends CustomPainter {
  final double breathProgress;

  CloudFacePainter({required this.breathProgress});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;

    _drawCloudShape(canvas, center, radius);
    _drawFace(canvas, center, radius);
  }

  void _drawCloudShape(Canvas canvas, Offset center, double radius) {
    final paint = Paint()
      ..shader = const LinearGradient(
        colors: [Color(0xFFE8F0FE), Color(0xFFD4E4FC)],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      ).createShader(Rect.fromCircle(center: center, radius: radius * 0.72));

    final r = radius * 0.55;
    final cx = center.dx;
    final cy = center.dy + r * 0.1;

    final path = Path();
    path.addOval(Rect.fromCenter(center: Offset(cx, cy), width: r * 1.6, height: r * 1.3));
    path.addOval(Rect.fromCenter(center: Offset(cx - r * 0.55, cy - r * 0.25), width: r * 0.9, height: r * 0.85));
    path.addOval(Rect.fromCenter(center: Offset(cx + r * 0.55, cy - r * 0.25), width: r * 0.9, height: r * 0.85));
    path.addOval(Rect.fromCenter(center: Offset(cx - r * 0.25, cy - r * 0.55), width: r * 0.75, height: r * 0.7));
    path.addOval(Rect.fromCenter(center: Offset(cx + r * 0.25, cy - r * 0.55), width: r * 0.75, height: r * 0.7));

    canvas.drawPath(path, paint);

    final highlightPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.4)
      ..style = PaintingStyle.fill;

    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(cx - r * 0.15, cy - r * 0.45),
        width: r * 0.5,
        height: r * 0.3,
      ),
      highlightPaint,
    );
  }

  void _drawFace(Canvas canvas, Offset center, double radius) {
    final r = radius * 0.55;
    final cx = center.dx;
    final cy = center.dy + r * 0.1;

    final eyeY = cy - r * 0.1;
    final leftEyeX = cx - r * 0.25;
    final rightEyeX = cx + r * 0.25;
    final eyeRadius = r * 0.08;

    final eyePaint = Paint()..color = const Color(0xFF2D3748);
    canvas.drawOval(
      Rect.fromCenter(center: Offset(leftEyeX, eyeY), width: eyeRadius * 2.2, height: eyeRadius * 2.6),
      eyePaint,
    );
    canvas.drawOval(
      Rect.fromCenter(center: Offset(rightEyeX, eyeY), width: eyeRadius * 2.2, height: eyeRadius * 2.6),
      eyePaint,
    );

    final glintPaint = Paint()..color = Colors.white;
    canvas.drawCircle(Offset(leftEyeX + eyeRadius * 0.4, eyeY - eyeRadius * 0.4), eyeRadius * 0.6, glintPaint);
    canvas.drawCircle(Offset(rightEyeX + eyeRadius * 0.4, eyeY - eyeRadius * 0.4), eyeRadius * 0.6, glintPaint);

    final cheekY = eyeY + r * 0.25;
    final cheekPaint = Paint()..color = const Color(0xFFFFB5B5).withValues(alpha: 0.35);
    canvas.drawOval(
      Rect.fromCenter(center: Offset(leftEyeX - r * 0.08, cheekY), width: r * 0.2, height: r * 0.12),
      cheekPaint,
    );
    canvas.drawOval(
      Rect.fromCenter(center: Offset(rightEyeX + r * 0.08, cheekY), width: r * 0.2, height: r * 0.12),
      cheekPaint,
    );

    final mouthY = cheekY + r * 0.08;
    final mouthPaint = Paint()
      ..color = const Color(0xFF5B7FFF)
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.04
      ..strokeCap = StrokeCap.round;

    final smileWidth = r * 0.22;
    final smileRect = Rect.fromCenter(
      center: Offset(cx, mouthY),
      width: smileWidth * 2,
      height: smileWidth,
    );
    canvas.drawArc(smileRect, 0.15 * math.pi, 0.7 * math.pi, false, mouthPaint);
  }

  @override
  bool shouldRepaint(covariant CloudFacePainter oldDelegate) {
    return oldDelegate.breathProgress != breathProgress;
  }
}
