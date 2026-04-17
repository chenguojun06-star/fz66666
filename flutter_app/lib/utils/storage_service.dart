import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:get/get.dart';

class StorageService extends GetxService {
  static const String _tokenKey = 'auth_token';
  static const String _userInfoKey = 'user_info';
  static const String _baseUrlKey = 'api_base_url';

  late SharedPreferences _prefs;

  Future<StorageService> init() async {
    _prefs = await SharedPreferences.getInstance();
    return this;
  }

  String getToken() => _prefs.getString(_tokenKey) ?? '';

  Future<void> setToken(String token) async {
    await _prefs.setString(_tokenKey, token);
  }

  Future<void> clearToken() async {
    await _prefs.remove(_tokenKey);
  }

  Map<String, dynamic>? getUserInfo() {
    final raw = _prefs.getString(_userInfoKey);
    if (raw == null) return null;
    try {
      return json.decode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<void> setUserInfo(Map<String, dynamic> info) async {
    await _prefs.setString(_userInfoKey, json.encode(info));
  }

  Future<void> clearUserInfo() async {
    await _prefs.remove(_userInfoKey);
  }

  String getUserRole() {
    final info = getUserInfo();
    return info?['roleCode']?.toString().toLowerCase() ?? '';
  }

  String getUserRoleName() {
    final info = getUserInfo();
    return info?['roleName']?.toString() ?? '';
  }

  String getUserTenantId() {
    final info = getUserInfo();
    return info?['tenantId']?.toString() ?? '';
  }

  bool isTenantOwner() => getUserInfo()?['isTenantOwner'] == true;

  bool isSuperAdmin() {
    final info = getUserInfo();
    if (info == null) return false;
    final role = (info['roleCode'] ?? '').toString().toLowerCase();
    return info['tenantId'] == null && (role == 'admin' || role == '管理员');
  }

  bool isFactoryOwner() => getUserInfo()?['isFactoryOwner'] == true;

  bool isTokenExpired() {
    final token = getToken();
    if (token.isEmpty) return true;
    try {
      final parts = token.split('.');
      if (parts.length != 3) return true;
      String payload = parts[1];
      while (payload.length % 4 != 0) {
        payload += '=';
      }
      final decoded = json.decode(utf8.decode(base64Url.decode(payload)));
      if (decoded['exp'] == null) return true;
      final nowSec = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      return decoded['exp'] < nowSec + 300;
    } catch (_) {
      return true;
    }
  }

  String getBaseUrl() => _prefs.getString(_baseUrlKey) ?? '';

  Future<void> setBaseUrl(String url) async {
    await _prefs.setString(_baseUrlKey, url);
  }

  dynamic getValue(String key, [dynamic fallback]) {
    return _prefs.get(key) ?? fallback;
  }

  Future<void> setValue(String key, dynamic value) async {
    if (value is String) {
      await _prefs.setString(key, value);
    } else if (value is int) {
      await _prefs.setInt(key, value);
    } else if (value is double) {
      await _prefs.setDouble(key, value);
    } else if (value is bool) {
      await _prefs.setBool(key, value);
    }
  }

  Future<void> remove(String key) async {
    await _prefs.remove(key);
  }

  Future<void> clearBusinessCache() async {
    const keys = [
      'pending_cutting_task',
      'pending_procurement_task',
      'pending_quality_task',
      'pending_repair_task',
      'pending_order_hint',
      'highlight_order_no',
      'mp_scan_type_index',
      'work_active_tab',
      'scan_history_v2',
      'pending_reminders',
    ];
    for (final key in keys) {
      await _prefs.remove(key);
    }
  }
}
