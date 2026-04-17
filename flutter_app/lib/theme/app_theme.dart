import 'package:flutter/material.dart';
import 'app_colors.dart';
import 'app_spacing.dart';

class AppTheme {
  static ThemeData get lightTheme => ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        scaffoldBackgroundColor: AppColors.bgPage,
        colorScheme: ColorScheme.light(
          primary: AppColors.primary,
          onPrimary: AppColors.textWhite,
          secondary: AppColors.primaryLight,
          error: AppColors.error,
          surface: AppColors.bgCard,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.bgCard,
          foregroundColor: AppColors.textPrimary,
          elevation: 0,
          centerTitle: true,
          surfaceTintColor: Colors.transparent,
        ),
        cardTheme: CardThemeData(
          color: AppColors.bgCard,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.lg),
            side: const BorderSide(color: AppColors.borderLight),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: AppColors.textWhite,
            minimumSize: const Size(88, 44),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            textStyle: const TextStyle(fontSize: AppFontSize.lg, fontWeight: FontWeight.w500),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.textPrimary,
            minimumSize: const Size(88, 44),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            side: const BorderSide(color: AppColors.border),
            backgroundColor: AppColors.bgGray,
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: AppColors.bgCard,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
            borderSide: const BorderSide(color: AppColors.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
            borderSide: const BorderSide(color: AppColors.border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
            borderSide: const BorderSide(color: AppColors.primary),
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          hintStyle: const TextStyle(color: AppColors.textPlaceholder, fontSize: AppFontSize.base),
        ),
        bottomNavigationBarTheme: const BottomNavigationBarThemeData(
          backgroundColor: AppColors.bgCard,
          selectedItemColor: AppColors.primary,
          unselectedItemColor: Color(0xFF999999),
          type: BottomNavigationBarType.fixed,
          elevation: 0,
        ),
        dividerTheme: const DividerThemeData(
          color: AppColors.borderLight,
          thickness: 1,
          space: 0,
        ),
        textTheme: const TextTheme(
          headlineLarge: TextStyle(fontSize: AppFontSize.xxxl, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
          headlineMedium: TextStyle(fontSize: AppFontSize.xxl, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
          headlineSmall: TextStyle(fontSize: AppFontSize.xl, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
          titleLarge: TextStyle(fontSize: AppFontSize.lg, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
          titleMedium: TextStyle(fontSize: AppFontSize.base, fontWeight: FontWeight.w500, color: AppColors.textPrimary),
          titleSmall: TextStyle(fontSize: AppFontSize.md, fontWeight: FontWeight.w500, color: AppColors.textPrimary),
          bodyLarge: TextStyle(fontSize: AppFontSize.base, color: AppColors.textPrimary),
          bodyMedium: TextStyle(fontSize: AppFontSize.md, color: AppColors.textSecondary),
          bodySmall: TextStyle(fontSize: AppFontSize.sm, color: AppColors.textTertiary),
          labelLarge: TextStyle(fontSize: AppFontSize.base, fontWeight: FontWeight.w500, color: AppColors.textPrimary),
          labelMedium: TextStyle(fontSize: AppFontSize.sm, color: AppColors.textSecondary),
          labelSmall: TextStyle(fontSize: AppFontSize.xs, color: AppColors.textTertiary),
        ),
      );
}
