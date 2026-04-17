import 'dart:convert';

enum QrCodeType {
  bundle,
  order,
  json,
  url,
  materialRoll,
  uCode,
  sample,
  unknown,
}

class ParsedQrCode {
  final QrCodeType type;
  final String raw;
  final String? orderNo;
  final String? bundleNo;
  final String? styleNo;
  final String? processCode;
  final String? materialCode;
  final Map<String, dynamic>? extra;

  const ParsedQrCode({
    required this.type,
    required this.raw,
    this.orderNo,
    this.bundleNo,
    this.styleNo,
    this.processCode,
    this.materialCode,
    this.extra,
  });

  String get displayName {
    switch (type) {
      case QrCodeType.bundle:
        return '菲号 $bundleNo';
      case QrCodeType.order:
        return '订单 $orderNo';
      case QrCodeType.json:
        return 'JSON数据';
      case QrCodeType.url:
        return 'URL链接';
      case QrCodeType.materialRoll:
        return '料卷 $materialCode';
      case QrCodeType.uCode:
        return 'U编码';
      case QrCodeType.sample:
        return '样衣';
      case QrCodeType.unknown:
        return '未知格式';
    }
  }
}

class QRCodeParser {
  static final RegExp _bundlePattern = RegExp(r'^[A-Za-z]*\d{4,}-\d{1,5}$');
  static final RegExp _orderPattern = RegExp(r'^ORD[-_]?\d{4,}', caseSensitive: false);
  static final RegExp _uCodePattern = RegExp(r'^U\d{6,}$');
  static final RegExp _materialRollPattern = RegExp(r'^MR[-_]?\d+', caseSensitive: false);
  static final RegExp _samplePattern = RegExp(r'^SAMPLE[-_]?\d+', caseSensitive: false);

  static ParsedQrCode parse(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) {
      return ParsedQrCode(type: QrCodeType.unknown, raw: raw);
    }

    if (_tryJson(trimmed)) return _parseJson(trimmed);
    if (_tryUrl(trimmed)) return _parseUrl(trimmed);
    if (_tryBundle(trimmed)) return _parseBundle(trimmed);
    if (_tryOrder(trimmed)) return _parseOrder(trimmed);
    if (_tryMaterialRoll(trimmed)) return _parseMaterialRoll(trimmed);
    if (_trySample(trimmed)) return _parseSample(trimmed);
    if (_tryUCode(trimmed)) return _parseUCode(trimmed);

    return ParsedQrCode(type: QrCodeType.unknown, raw: raw);
  }

  static bool _tryJson(String code) {
    return code.startsWith('{') && code.endsWith('}');
  }

  static ParsedQrCode _parseJson(String code) {
    try {
      final map = json.decode(code) as Map<String, dynamic>;
      return ParsedQrCode(
        type: QrCodeType.json,
        raw: code,
        orderNo: map['orderNo']?.toString(),
        bundleNo: map['bundleNo']?.toString(),
        styleNo: map['styleNo']?.toString(),
        processCode: map['processCode']?.toString(),
        extra: map,
      );
    } catch (_) {
      return ParsedQrCode(type: QrCodeType.unknown, raw: code);
    }
  }

  static bool _tryUrl(String code) {
    return code.startsWith('http://') || code.startsWith('https://');
  }

  static ParsedQrCode _parseUrl(String code) {
    final uri = Uri.tryParse(code);
    final params = uri?.queryParameters ?? {};
    return ParsedQrCode(
      type: QrCodeType.url,
      raw: code,
      orderNo: params['orderNo'] ?? params['order'] ?? params['ord'],
      bundleNo: params['bundleNo'] ?? params['bundle'] ?? params['bno'],
      styleNo: params['styleNo'] ?? params['style'],
      extra: params,
    );
  }

  static bool _tryBundle(String code) {
    return _bundlePattern.hasMatch(code) || code.contains('-') && _hasDigits(code);
  }

  static ParsedQrCode _parseBundle(String code) {
    String? orderNo;
    String? bundleNo;
    final dashIdx = code.lastIndexOf('-');
    if (dashIdx > 0) {
      orderNo = code.substring(0, dashIdx);
      bundleNo = code.substring(dashIdx + 1);
    }
    return ParsedQrCode(
      type: QrCodeType.bundle,
      raw: code,
      orderNo: orderNo,
      bundleNo: bundleNo ?? code,
    );
  }

  static bool _tryOrder(String code) {
    return _orderPattern.hasMatch(code);
  }

  static ParsedQrCode _parseOrder(String code) {
    return ParsedQrCode(
      type: QrCodeType.order,
      raw: code,
      orderNo: code,
    );
  }

  static bool _tryMaterialRoll(String code) {
    return _materialRollPattern.hasMatch(code);
  }

  static ParsedQrCode _parseMaterialRoll(String code) {
    return ParsedQrCode(
      type: QrCodeType.materialRoll,
      raw: code,
      materialCode: code,
    );
  }

  static bool _trySample(String code) {
    return _samplePattern.hasMatch(code);
  }

  static ParsedQrCode _parseSample(String code) {
    return ParsedQrCode(
      type: QrCodeType.sample,
      raw: code,
      extra: {'sampleCode': code},
    );
  }

  static bool _tryUCode(String code) {
    return _uCodePattern.hasMatch(code);
  }

  static ParsedQrCode _parseUCode(String code) {
    return ParsedQrCode(
      type: QrCodeType.uCode,
      raw: code,
      extra: {'uCode': code},
    );
  }

  static bool _hasDigits(String s) {
    return s.codeUnits.any((c) => c >= 48 && c <= 57);
  }
}
