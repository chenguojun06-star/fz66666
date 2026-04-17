import 'package:dio/dio.dart';
import 'package:get/get.dart' hide Response, FormData, MultipartFile;
import 'storage_service.dart';
import 'http_service.dart';

enum AppErrorType {
  network,
  auth,
  server,
  business,
  validation,
  timeout,
  unknown,
}

class AppError {
  final AppErrorType type;
  final String message;
  final String? detail;
  final int? statusCode;

  const AppError({
    required this.type,
    required this.message,
    this.detail,
    this.statusCode,
  });

  bool get isRetryable => type == AppErrorType.network || type == AppErrorType.timeout;

  factory AppError.fromDioError(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return const AppError(type: AppErrorType.timeout, message: '请求超时，请检查网络');
      case DioExceptionType.connectionError:
        return const AppError(type: AppErrorType.network, message: '网络连接失败');
      case DioExceptionType.badResponse:
        final code = e.response?.statusCode;
        final data = e.response?.data;
        String msg = '服务器错误';
        if (data is Map) {
          msg = data['message']?.toString() ?? data['msg']?.toString() ?? msg;
        }
        if (code == 401 || code == 403) {
          return AppError(type: AppErrorType.auth, message: '登录已过期', statusCode: code);
        }
        return AppError(type: AppErrorType.server, message: msg, statusCode: code);
      default:
        return const AppError(type: AppErrorType.unknown, message: '未知错误');
    }
  }

  factory AppError.fromBusinessError(Map<String, dynamic> data) {
    final code = data['code'] as int? ?? -1;
    final msg = data['message']?.toString() ?? data['msg']?.toString() ?? '操作失败';
    if (code == 401 || code == 403) {
      return AppError(type: AppErrorType.auth, message: '登录已过期', statusCode: code);
    }
    return AppError(type: AppErrorType.business, message: msg, statusCode: code);
  }
}

class ErrorHandler {
  static void handle(dynamic error, {bool showSnackbar = true}) {
    AppError appError;

    if (error is DioException) {
      appError = AppError.fromDioError(error);
    } else if (error is AppError) {
      appError = error;
    } else {
      appError = AppError(type: AppErrorType.unknown, message: error.toString());
    }

    if (appError.type == AppErrorType.auth) {
      final storage = Get.find<StorageService>();
      storage.clearToken();
      storage.clearUserInfo();
      Get.offAllNamed('/login');
      return;
    }

    if (showSnackbar) {
      Get.snackbar(
        '提示',
        appError.message,
        snackPosition: SnackPosition.TOP,
        duration: const Duration(seconds: 3),
      );
    }
  }

  static Future<void> reportError(dynamic error, StackTrace stack) async {
    try {
      final http = Get.find<HttpService>();
      await http.post('/api/system/error-report', data: {
        'error': error.toString(),
        'stackTrace': stack.toString(),
        'platform': 'flutter',
        'timestamp': DateTime.now().toIso8601String(),
      });
    } catch (_) {}
  }
}
