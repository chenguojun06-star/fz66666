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
  late AnimationController _floatController;
  late AnimationController _glowController;
  late AnimationController _blinkController;
  late AnimationController _smileController;
  late AnimationController _sparkController;

  @override
  void initState() {
    super.initState();
    if (!Get.isRegistered<WorkAiController>()) {
      Get.put(WorkAiController());
    }
    _floatController = AnimationController(vsync: this, duration: const Duration(milliseconds: 4800))..repeat(reverse: true);
    _glowController = AnimationController(vsync: this, duration: const Duration(milliseconds: 5200))..repeat(reverse: true);
    _blinkController = AnimationController(vsync: this, duration: const Duration(milliseconds: 6600))..repeat();
    _smileController = AnimationController(vsync: this, duration: const Duration(milliseconds: 3800))..repeat(reverse: true);
    _sparkController = AnimationController(vsync: this, duration: const Duration(milliseconds: 2000))..repeat(reverse: true);
  }

  @override
  void dispose() {
    _floatController.dispose();
    _glowController.dispose();
    _blinkController.dispose();
    _smileController.dispose();
    _sparkController.dispose();
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
        feedback: _buildTrigger(isDragging: true),
        childWhenDragging: Container(),
        onDragStarted: () => setState(() => isDragging = true),
        onDragEnd: (details) {
          setState(() {
            isDragging = false;
            double x = details.offset.dx;
            double y = details.offset.dy;
            if (x < 0) x = 0;
            if (x > Get.width - 56) x = Get.width - 56;
            if (y < 80) y = 80;
            if (y > Get.height - 100) y = Get.height - 100;
            position = Offset(x, y);
          });
        },
        child: GestureDetector(
          onTap: _showAiDialog,
          child: _buildTrigger(),
        ),
      ),
    );
  }

  Widget _buildTrigger({bool isDragging = false}) {
    return AnimatedBuilder(
      animation: Listenable.merge([_floatController, _glowController, _blinkController, _smileController, _sparkController]),
      builder: (context, child) {
        return Transform.translate(
          offset: Offset(0, _floatController.value * -2),
          child: SizedBox(
            width: 56,
            height: 56,
            child: Stack(
              alignment: Alignment.center,
              children: [
                _buildGlow(),
                Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.horizontal(
                      left: isDragging ? const Radius.circular(16) : const Radius.circular(16),
                      right: isDragging ? const Radius.circular(16) : const Radius.circular(16),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: isDragging ? 0.2 : 0.14),
                        blurRadius: 10,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: CustomPaint(
                    painter: MiniCloudPainter(
                      blinkValue: _blinkController.value,
                      smileValue: _smileController.value,
                      sparkValue: _sparkController.value,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildGlow() {
    final progress = _glowController.value;
    return Container(
      width: 50 + progress * 4,
      height: 50 + progress * 4,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: [
            AppColors.primary.withValues(alpha: 0.22 * (0.6 + progress * 0.4)),
            AppColors.primary.withValues(alpha: 0.04 * (0.6 + progress * 0.4)),
            Colors.transparent,
          ],
          stops: const [0.0, 0.66, 0.78],
        ),
      ),
    );
  }

  void _showAiDialog() {
    Get.bottomSheet(
      Container(
        decoration: const BoxDecoration(
          color: AppColors.bgCard,
          borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
              decoration: const BoxDecoration(
                color: AppColors.bgLight,
                border: Border(bottom: BorderSide(color: AppColors.borderLight)),
              ),
              child: Row(
                children: [
                  SizedBox(
                    width: 32,
                    height: 32,
                    child: CustomPaint(
                      painter: MiniCloudPainter(blinkValue: 0.0, smileValue: 0.5, sparkValue: 0.5),
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('☁️ 小云帮助中心', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                        Text('随时为你解答生产管理问题', style: TextStyle(fontSize: 11, color: AppColors.textTertiary)),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => Get.back(),
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: AppColors.bgGray,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Icon(Icons.close, size: 18, color: AppColors.textTertiary),
                    ),
                  ),
                ],
              ),
            ),
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

class MiniCloudPainter extends CustomPainter {
  final double blinkValue;
  final double smileValue;
  final double sparkValue;

  MiniCloudPainter({
    required this.blinkValue,
    required this.smileValue,
    required this.sparkValue,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;
    final cy = h / 2 + 2;

    _drawCloudBody(canvas, cx, cy, w);
    _drawEyes(canvas, cx, cy, w);
    _drawSmile(canvas, cx, cy, w);
    _drawSparks(canvas, cx, cy, w);
  }

  void _drawCloudBody(Canvas canvas, double cx, double cy, double w) {
    final paint = Paint()
      ..shader = const LinearGradient(
        colors: [Color(0xFFFAFBFC), Color(0xFFE8F0FE)],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      ).createShader(Rect.fromCenter(center: Offset(cx, cy), width: w * 0.8, height: w * 0.6));

    final shadowPaint = Paint()
      ..color = AppColors.primary.withValues(alpha: 0.14)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3);

    final r = w * 0.16;

    final bodyRect = Rect.fromCenter(center: Offset(cx, cy + r * 0.3), width: r * 3.2, height: r * 2.2);
    canvas.drawRRect(RRect.fromRectAndRadius(bodyRect, Radius.circular(r * 1.1)), shadowPaint);

    final leftCircle = Rect.fromCenter(center: Offset(cx - r * 1.1, cy - r * 0.5), width: r * 1.6, height: r * 1.6);
    canvas.drawOval(leftCircle, paint);

    final centerCircle = Rect.fromCenter(center: Offset(cx, cy - r * 1.1), width: r * 2.1, height: r * 2.1);
    canvas.drawOval(centerCircle, paint);

    final rightCircle = Rect.fromCenter(center: Offset(cx + r * 1.1, cy - r * 0.5), width: r * 1.5, height: r * 1.5);
    canvas.drawOval(rightCircle, paint);

    final baseRect = Rect.fromCenter(center: Offset(cx, cy + r * 0.3), width: r * 3.2, height: r * 2.2);
    canvas.drawRRect(RRect.fromRectAndRadius(baseRect, Radius.circular(r * 1.1)), paint);

    final highlightPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.9)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    canvas.drawArc(
      Rect.fromCenter(center: Offset(cx - r * 0.3, cy - r * 1.4), width: r * 1.2, height: r * 0.8),
      -0.8,
      1.6,
      false,
      highlightPaint,
    );
  }

  void _drawEyes(Canvas canvas, double cx, double cy, double w) {
    final r = w * 0.16;
    final eyeY = cy - r * 0.2;
    final leftEyeX = cx - r * 0.65;
    final rightEyeX = cx + r * 0.65;
    final eyeW = r * 0.32;
    final eyeH = r * 0.38;

    double scaleY = 1.0;
    if (blinkValue > 0.90 && blinkValue < 0.96) {
      scaleY = 0.1;
    }

    final eyePaint = Paint()..color = AppColors.primary;

    canvas.save();
    canvas.translate(leftEyeX, eyeY);
    canvas.scale(1.0, scaleY);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset.zero, width: eyeW, height: eyeH),
        Radius.circular(eyeW / 2),
      ),
      eyePaint,
    );
    canvas.restore();

    canvas.save();
    canvas.translate(rightEyeX, eyeY);
    canvas.scale(1.0, scaleY);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset.zero, width: eyeW, height: eyeH),
        Radius.circular(eyeW / 2),
      ),
      eyePaint,
    );
    canvas.restore();

    if (scaleY > 0.5) {
      final glintPaint = Paint()..color = Colors.white.withValues(alpha: 0.96);
      final glintR = eyeW * 0.2;
      canvas.drawCircle(Offset(leftEyeX + eyeW * 0.15, eyeY - eyeH * 0.15), glintR, glintPaint);
      canvas.drawCircle(Offset(rightEyeX + eyeW * 0.15, eyeY - eyeH * 0.15), glintR, glintPaint);
    }
  }

  void _drawSmile(Canvas canvas, double cx, double cy, double w) {
    final r = w * 0.16;
    final smileY = cy + r * 0.45;
    final smileW = r * 0.65;
    final smileH = r * 0.32 * (0.8 + smileValue * 0.5);

    final smilePaint = Paint()
      ..color = AppColors.primary
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.1
      ..strokeCap = StrokeCap.round;

    final smileRect = Rect.fromCenter(
      center: Offset(cx, smileY),
      width: smileW,
      height: smileH,
    );
    canvas.drawArc(smileRect, 0.15 * math.pi, 0.7 * math.pi, false, smilePaint);
  }

  void _drawSparks(Canvas canvas, double cx, double cy, double w) {
    final r = w * 0.16;
    final sparkR = r * 0.12;
    final alpha = sparkValue;

    final sparkPaint = Paint()
      ..color = AppColors.warning.withValues(alpha: alpha)
      ..style = PaintingStyle.fill;

    canvas.drawCircle(Offset(cx - r * 1.6, cy - r * 0.8), sparkR, sparkPaint);
    canvas.drawCircle(Offset(cx + r * 1.5, cy - r * 0.6), sparkR, sparkPaint);
  }

  @override
  bool shouldRepaint(covariant MiniCloudPainter oldDelegate) {
    return oldDelegate.blinkValue != blinkValue ||
        oldDelegate.smileValue != smileValue ||
        oldDelegate.sparkValue != sparkValue;
  }
}
