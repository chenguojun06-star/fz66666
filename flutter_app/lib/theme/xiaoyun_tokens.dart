import 'package:flutter/material.dart';

class XiaoyunTokens {
  XiaoyunTokens._();

  static const Color primary = Color(0xFF1677FF);
  static const Color primaryBg = Color(0xFFE6F4FF);
  static const Color primaryBorder = Color(0xFF91CAFF);

  static const Color success = Color(0xFF52C41A);
  static const Color successBg = Color(0xFFF6FFED);
  static const Color successBorder = Color(0xFFB7EB8F);

  static const Color warning = Color(0xFFFA8C16);
  static const Color warningBg = Color(0xFFFFF7E6);
  static const Color warningBorder = Color(0xFFFFD591);

  static const Color danger = Color(0xFFFF4D4F);
  static const Color dangerBg = Color(0xFFFFF1F0);
  static const Color dangerBorder = Color(0xFFFFA39E);

  static const Color textPrimary = Color(0xE0000000);
  static const Color textSecondary = Color(0xA6000000);
  static const Color textTertiary = Color(0x73000000);

  static const Color bgCard = Color(0xFFFFFFFF);
  static const Color bgPage = Color(0xFFF5F5F5);
  static const Color borderCard = Color(0xFFF0F0F0);

  static const double radiusSm = 6.0;
  static const double radiusMd = 8.0;
  static const double radiusLg = 12.0;

  static const double fontXs = 11.0;
  static const double fontSm = 12.0;
  static const double fontBase = 13.0;
  static const double fontLg = 15.0;
  static const double fontXl = 18.0;

  static const double spacingXs = 4.0;
  static const double spacingSm = 8.0;
  static const double spacingMd = 12.0;
  static const double spacingLg = 16.0;

  static Color levelColor(String level) {
    switch (level) {
      case 'success': return success;
      case 'warning': return warning;
      case 'danger': return danger;
      default: return primary;
    }
  }

  static Color levelBg(String level) {
    switch (level) {
      case 'success': return successBg;
      case 'warning': return warningBg;
      case 'danger': return dangerBg;
      default: return primaryBg;
    }
  }

  static Color levelBorder(String level) {
    switch (level) {
      case 'success': return successBorder;
      case 'warning': return warningBorder;
      case 'danger': return dangerBorder;
      default: return primaryBorder;
    }
  }
}
