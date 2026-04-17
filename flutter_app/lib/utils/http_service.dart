import 'package:dio/dio.dart';
import 'package:get/get.dart' hide Response, FormData, MultipartFile;
import 'storage_service.dart';
import '../config/app_config.dart';

class HttpService extends GetxService {
  late Dio _dio;
  final StorageService _storage = Get.find<StorageService>();

  Future<HttpService> init() async {
    _dio = Dio(BaseOptions(
      baseUrl: _storage.getBaseUrl().isNotEmpty
          ? _storage.getBaseUrl()
          : AppConfig.defaultBaseUrl,
      connectTimeout: Duration(milliseconds: AppConfig.requestTimeout),
      receiveTimeout: Duration(milliseconds: AppConfig.requestTimeout),
      headers: {'content-type': 'application/json'},
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final token = _storage.getToken();
        if (token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onResponse: (response, handler) {
        handler.next(response);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401 ||
            error.response?.statusCode == 403) {
          await _storage.clearToken();
          await _storage.clearUserInfo();
          Get.offAllNamed('/login');
        }
        handler.next(error);
      },
    ));

    return this;
  }

  void updateBaseUrl(String url) {
    _dio.options.baseUrl = url;
  }

  Future<Response> get(String path, {Map<String, dynamic>? params}) {
    return _dio.get(path, queryParameters: params);
  }

  Future<Response> post(String path, {dynamic data, Map<String, dynamic>? params}) {
    return _dio.post(path, data: data, queryParameters: params);
  }

  Future<Response> put(String path, {dynamic data}) {
    return _dio.put(path, data: data);
  }

  Future<Response> delete(String path, {Map<String, dynamic>? params}) {
    return _dio.delete(path, queryParameters: params);
  }

  Future<Response> uploadFile(String path, String filePath, {String fieldName = 'file', Map<String, dynamic>? formData}) async {
    final formDataObj = FormData.fromMap({
      fieldName: await MultipartFile.fromFile(filePath),
      ...?formData,
    });
    return _dio.post(path, data: formDataObj,
      options: Options(
        contentType: 'multipart/form-data',
        receiveTimeout: Duration(milliseconds: AppConfig.uploadTimeout),
      ),
    );
  }
}

class ApiResult<T> {
  final int code;
  final String? message;
  final T? data;

  ApiResult({required this.code, this.message, this.data});

  bool get isSuccess => code == 200;

  factory ApiResult.fromJson(Map<String, dynamic> json, [T Function(dynamic)? fromJsonT]) {
    return ApiResult(
      code: json['code'] as int? ?? -1,
      message: json['message']?.toString() ?? json['msg']?.toString(),
      data: json['data'] != null && fromJsonT != null ? fromJsonT(json['data']) : json['data'] as T?,
    );
  }
}
