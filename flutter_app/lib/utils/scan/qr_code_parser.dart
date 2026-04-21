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
  final String? processName;
  final String? color;
  final String? size;
  final int? quantity;
  final String? materialCode;
  final Map<String, dynamic>? extra;

  const ParsedQrCode({
    required this.type,
    required this.raw,
    this.orderNo,
    this.bundleNo,
    this.styleNo,
    this.processCode,
    this.processName,
    this.color,
    this.size,
    this.quantity,
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
  static final RegExp _poOrderPattern = RegExp(r'^PO\d{6,}', caseSensitive: false);
  static final RegExp _materialRollPattern = RegExp(r'^MR[-_]?\d+', caseSensitive: false);
  static final RegExp _samplePattern = RegExp(r'^SAMPLE[-_]?\d+', caseSensitive: false);
  static final RegExp _uCodePattern = RegExp(r'^U[-]?', caseSensitive: false);

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
    if (!code.contains('-')) return false;
    final parts = code.split('-');
    if (parts.length < 3) return false;
    final first = parts[0];
    return _poOrderPattern.hasMatch(first);
  }

  static ParsedQrCode _parseBundle(String code) {
    final parts = code.split('-');
    final orderNo = parts.isNotEmpty ? parts[0] : null;
    String? processCode;
    String? color;
    String? size;
    int? quantity;
    String? bundleNo;

    if (parts.length >= 2) {
      processCode = parts[1];
    }

    if (parts.length >= 5) {
      final tail = parts.sublist(2);
      if (tail.length >= 3) {
        final lastTwo = tail.sublist(tail.length - 2);
        final maybeQty = int.tryParse(lastTwo[1]);
        final maybeBundleNo = int.tryParse(lastTwo[0]);
        if (maybeQty != null && maybeBundleNo != null) {
          bundleNo = lastTwo[0];
          quantity = maybeQty;
          size = tail[tail.length - 3];
          color = tail.sublist(0, tail.length - 3).join('-');
        } else if (maybeBundleNo != null) {
          bundleNo = lastTwo[0];
          size = lastTwo[1];
          color = tail.sublist(0, tail.length - 2).join('-');
        } else {
          size = tail.last;
          color = tail.sublist(0, tail.length - 1).join('-');
        }
      } else if (tail.length == 2) {
        size = tail[1];
        color = tail[0];
      } else if (tail.length == 1) {
        color = tail[0];
      }
    }

    return ParsedQrCode(
      type: QrCodeType.bundle,
      raw: code,
      orderNo: orderNo,
      bundleNo: bundleNo,
      styleNo: processCode,
      processCode: processCode,
      color: color,
      size: size,
      quantity: quantity,
    );
  }

  static bool _tryOrder(String code) {
    return _poOrderPattern.hasMatch(code);
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
    final parts = code.split('-');
    return ParsedQrCode(
      type: QrCodeType.uCode,
      raw: code,
      orderNo: parts.length > 1 ? parts[1] : null,
      extra: {'uCode': code, 'parts': parts},
    );
  }
}
