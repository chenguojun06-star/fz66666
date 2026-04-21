import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:fashion_supplychain/main.dart';
import 'package:fashion_supplychain/utils/api_service.dart';
import 'package:fashion_supplychain/utils/http_service.dart';
import 'package:fashion_supplychain/utils/storage_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    Get.reset();

    final storage = await StorageService().init();
    Get.put(storage);

    final http = await HttpService().init();
    Get.put(http);
    Get.put(ApiService());
  });

  tearDown(Get.reset);

  testWidgets('MyApp shows login page when no token exists', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('衣智链'), findsOneWidget);
    expect(find.text('有问题找小云｜多端协同更轻松'), findsOneWidget);
  });
}
