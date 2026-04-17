import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path_provider/path_provider.dart';
import '../api_service.dart';

class ScanOfflineQueue {
  static const int maxPending = 50;
  static const int maxRetry = 5;
  static const int ttlHours = 24;

  final ApiService _api = Get.find<ApiService>();
  Database? _db;
  bool _uploading = false;

  Future<Database> _getDb() async {
    if (_db != null && _db!.isOpen) return _db!;
    final dir = await getApplicationDocumentsDirectory();
    _db = await openDatabase(
      '${dir.path}/scan_offline.db',
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE pending_scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            qr_code TEXT NOT NULL,
            scan_data TEXT NOT NULL,
            scan_time INTEGER NOT NULL,
            retry_count INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
          )
        ''');
      },
    );
    return _db!;
  }

  Future<void> enqueue(String qrCode, Map<String, dynamic> scanData) async {
    final db = await _getDb();
    final count = (await db.rawQuery('SELECT COUNT(*) as c FROM pending_scans')).first['c'] as int;
    if (count >= maxPending) {
      await db.delete('pending_scans', where: 'id = (SELECT MIN(id) FROM pending_scans)');
    }
    await db.insert('pending_scans', {
      'qr_code': qrCode,
      'scan_data': json.encode(scanData),
      'scan_time': DateTime.now().millisecondsSinceEpoch,
      'retry_count': 0,
      'created_at': DateTime.now().millisecondsSinceEpoch,
    });
  }

  Future<int> getPendingCount() async {
    final db = await _getDb();
    final result = await db.rawQuery('SELECT COUNT(*) as c FROM pending_scans');
    return result.first['c'] as int;
  }

  Future<void> uploadAll() async {
    if (_uploading) return;
    _uploading = true;

    try {
      final connectivity = await Connectivity().checkConnectivity();
      if (connectivity.contains(ConnectivityResult.none)) return;

      final db = await _getDb();
      await _cleanExpired(db);

      final rows = await db.query('pending_scans', orderBy: 'created_at ASC');
      for (final row in rows) {
        try {
          final data = json.decode(row['scan_data'] as String) as Map<String, dynamic>;
          final res = await _api.executeScan(data);
          final resData = res.data;
          if (resData is Map && resData['code'] == 200) {
            await db.delete('pending_scans', where: 'id = ?', whereArgs: [row['id']]);
          } else {
            await _incrementRetry(db, row['id'] as int, row['retry_count'] as int);
          }
        } catch (_) {
          await _incrementRetry(db, row['id'] as int, row['retry_count'] as int);
        }
      }
    } finally {
      _uploading = false;
    }
  }

  Future<void> _incrementRetry(Database db, int id, int currentRetry) async {
    if (currentRetry + 1 >= maxRetry) {
      await db.delete('pending_scans', where: 'id = ?', whereArgs: [id]);
    } else {
      await db.update('pending_scans', {'retry_count': currentRetry + 1}, where: 'id = ?', whereArgs: [id]);
    }
  }

  Future<void> _cleanExpired(Database db) async {
    final ttl = Duration(hours: ttlHours).inMilliseconds;
    final cutoff = DateTime.now().millisecondsSinceEpoch - ttl;
    await db.delete('pending_scans', where: 'created_at < ?', whereArgs: [cutoff]);
  }

  Future<void> clearAll() async {
    final db = await _getDb();
    await db.delete('pending_scans');
  }
}
