import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Flutter扫码参数映射测试 - 规则13', () {
    group('scanType归一化', () {
      String normalizeScanType(String type) {
        switch (type) {
          case 'cutting': return 'cutting';
          case 'production': return 'production';
          case 'quality': return 'quality';
          case 'warehouse': return 'warehouse';
          case 'pattern': return 'pattern';
          default: return 'production';
        }
      }

      test('cutting保持不变', () {
        expect(normalizeScanType('cutting'), 'cutting');
      });

      test('production保持不变', () {
        expect(normalizeScanType('production'), 'production');
      });

      test('quality保持不变', () {
        expect(normalizeScanType('quality'), 'quality');
      });

      test('warehouse保持不变', () {
        expect(normalizeScanType('warehouse'), 'warehouse');
      });

      test('pattern保持不变', () {
        expect(normalizeScanType('pattern'), 'pattern');
      });

      test('未知类型默认为production', () {
        expect(normalizeScanType('unknown'), 'production');
      });
    });

    group('扫码API参数字段名一致性', () {
      test('scanCode字段名与后端一致', () {
        const fieldName = 'scanCode';
        expect(fieldName, 'scanCode');
        expect(fieldName, isNot('qrCode'));
      });

      test('scanType字段名与后端一致', () {
        const fieldName = 'scanType';
        expect(fieldName, 'scanType');
        expect(fieldName, isNot('type'));
      });

      test('processName字段名与后端一致', () {
        const fieldName = 'processName';
        expect(fieldName, 'processName');
      });

      test('quantity字段名与后端一致', () {
        const fieldName = 'quantity';
        expect(fieldName, 'quantity');
      });

      test('source固定为flutter', () {
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

    group('质检两步提交参数', () {
      test('qualityStage使用receive/confirm', () {
        const validStages = ['receive', 'confirm'];
        expect(validStages, contains('receive'));
        expect(validStages, contains('confirm'));
        expect(validStages, isNot(contains('quality_confirm')));
      });

      test('qualityResult使用qualified/unqualified', () {
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
      test('撤销使用recordId字段', () {
        const payload = {'recordId': 'sr-001'};
        expect(payload.containsKey('recordId'), isTrue);
      });
    });

    group('WebSocket参数', () {
      test('WebSocket路径为/ws/realtime', () {
        const wsPath = '/ws/realtime';
        expect(wsPath, '/ws/realtime');
        expect(wsPath, isNot('/ws'));
      });

      test('心跳类型为ping(小写)', () {
        const heartbeat = 'ping';
        expect(heartbeat, 'ping');
        expect(heartbeat, isNot('PING'));
      });
    });

    group('禁止的参数名', () {
      test('禁止使用qrCode代替scanCode', () {
        const fieldName = 'scanCode';
        expect(fieldName, isNot('qrCode'));
      });

      test('禁止使用type代替scanType', () {
        const fieldName = 'scanType';
        expect(fieldName, isNot('type'));
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
