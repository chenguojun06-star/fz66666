import 'package:flutter/material.dart';

class AppColors {
  static const Color primary = Color(0xFF2563EB);
  static const Color primaryLight = Color(0xFF3B82F6);
  static const Color primaryDark = Color(0xFF1D4ED8);

  static const Color success = Color(0xFF07C160);
  static const Color warning = Color(0xFFFA9D3B);
  static const Color error = Color(0xFFFA5151);
  static const Color danger = Color(0xFFFA5151);
  static const Color info = Color(0xFF10AEFF);
  static const Color purple = Color(0xFF6467F0);

  static const Color bgPage = Color(0xFFEDEDED);
  static const Color bgCard = Color(0xFFFFFFFF);
  static const Color bgGray = Color(0xFFF7F7F7);
  static const Color bgLight = Color(0xFFFAFBFC);

  static const Color border = Color(0x1A000000);
  static const Color borderLight = Color(0x0D000000);

  static const Color textPrimary = Color(0xE6000000);
  static const Color textSecondary = Color(0x8C000000);
  static const Color textTertiary = Color(0x4D000000);
  static const Color textPlaceholder = Color(0x4D000000);
  static const Color textWhite = Color(0xFFFFFFFF);

  static const Color tagBgOrange = Color(0x1AFA9D3B);
  static const Color tagBgGreen = Color(0x1A07C160);
  static const Color tagBgRed = Color(0x1AFA5151);
  static const Color tagBgBlue = Color(0x1A10AEFF);

  static const Color overlay = Color(0x80000000);
}

class AppFontSize {
  static const double xxs = 11;
  static const double xs = 12;
  static const double sm = 13;
  static const double base = 15;
  static const double md = 14;
  static const double lg = 17;
  static const double xl = 20;
  static const double xxl = 22;
  static const double xxxl = 24;
}

class AppShadow {
  static List<BoxShadow> get sm => [
        BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 1),
      ];
  static List<BoxShadow> get md => [
        BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 1),
        BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 4, offset: const Offset(0, 2)),
      ];
  static List<BoxShadow> get lg => [
        BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 1),
        BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 8, offset: const Offset(0, 4)),
      ];
}
