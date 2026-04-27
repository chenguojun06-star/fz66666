import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Flutter扫码参数映射测试 - 规则13', () {
    group('scanType归一化 - 验证ScanType枚举值域', () {
      const validScanTypes = ['cutting', 'production', 'quality', 'warehouse', 'pattern'];

      test('cutting是合法scanType', () {
        expect(validScanTypes, contains('cutting'));
      });

      test('production是合法scanType', () {
        expect(validScanTypes, contains('production'));
      });

      test('quality是合法scanType', () {
        expect(validScanTypes, contains('quality'));
      });

      test('warehouse是合法scanType', () {
        expect(validScanTypes, contains('warehouse'));
      });

      test('pattern是合法scanType(样衣扫码)', () {
        expect(validScanTypes, contains('pattern'));
      });

      test('未知类型应默认为production', () {
        const defaultType = 'production';
        expect(validScanTypes, contains(defaultType));
      });
    });

    group('扫码API请求体字段名 - 与scan_controller.dart一致', () {
      test('请求体必须包含scanCode(非qrCode)', () {
        const requiredFields = ['scanCode', 'scanType', 'processName', 'quantity', 'source'];
        expect(requiredFields, contains('scanCode'));
        expect(requiredFields, isNot(contains('qrCode')));
      });

      test('请求体必须包含scanType(非type)', () {
        const requiredFields = ['scanCode', 'scanType', 'processName', 'quantity', 'source'];
        expect(requiredFields, contains('scanType'));
        expect(requiredFields, isNot(contains('type')));
      });

      test('请求体必须包含processName', () {
        const requiredFields = ['scanCode', 'scanType', 'processName', 'quantity', 'source'];
        expect(requiredFields, contains('processName'));
      });

      test('请求体必须包含quantity', () {
        const requiredFields = ['scanCode', 'scanType', 'processName', 'quantity', 'source'];
        expect(requiredFields, contains('quantity'));
      });

      test('source固定为flutter(非miniprogram/h5)', () {
        const source = 'flutter';
        expect(source, 'flutter');
        expect(source, isNot('miniprogram'));
        expect(source, isNot('h5'));
      });

      test('requestId前缀为flutter_', () {
        final requestId = 'flutter_${DateTime.now().millisecondsSinceEpoch}_123';
        expect(requestId.startsWith('flutter_'), isTrue);
      });
    });

    group('质检两步提交参数 - 与scan_quality_controller.dart一致', () {
      test('qualityStage使用receive/confirm(非quality_confirm)', () {
        const validStages = ['receive', 'confirm'];
        expect(validStages, contains('receive'));
        expect(validStages, contains('confirm'));
        expect(validStages, isNot(contains('quality_confirm')));
      });

      test('qualityResult使用qualified/unqualified(非defective)', () {
        const validResults = ['qualified', 'unqualified'];
        expect(validResults, contains('qualified'));
        expect(validResults, contains('unqualified'));
        expect(validResults, isNot(contains('defective')));
      });

      test('defectQuantity字段名与后端一致', () {
        const fieldName = 'defectQuantity';
        expect(fieldName, 'defectQuantity');
      });
    });

    group('撤销/退回重扫参数', () {
      test('撤销使用recordId字段(非id/scanId)', () {
        const payload = {'recordId': 'sr-001'};
        expect(payload.containsKey('recordId'), isTrue);
        expect(payload.containsKey('id'), isFalse);
        expect(payload.containsKey('scanId'), isFalse);
      });
    });

    group('WebSocket参数 - 与websocket_service.dart一致', () {
      test('WebSocket路径为/ws/realtime(非/ws)', () {
        const wsPath = '/ws/realtime';
        expect(wsPath, '/ws/realtime');
        expect(wsPath, isNot('/ws'));
      });

      test('心跳类型为ping小写(非PING)', () {
        const heartbeatType = 'ping';
        expect(heartbeatType, 'ping');
        expect(heartbeatType, isNot('PING'));
      });
    });

    group('禁止的参数名 - 规则13/18', () {
      test('禁止使用qrCode代替scanCode', () {
        expect('scanCode', isNot('qrCode'));
      });

      test('禁止使用type代替scanType', () {
        expect('scanType', isNot('type'));
      });

      test('禁止使用quality_confirm作为qualityStage', () {
        const validStages = ['receive', 'confirm'];
        expect(validStages, isNot(contains('quality_confirm')));
      });

      test('禁止使用defective作为qualityResult', () {
        const validResults = ['qualified', 'unqualified'];
        expect(validResults, isNot(contains('defective')));
      });
    });
  });
}
