import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'utils/storage_service.dart';
import 'utils/http_service.dart';
import 'utils/api_service.dart';
import 'theme/app_theme.dart';
import 'routes/app_routes.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final storage = await StorageService().init();
  Get.put(storage);
  final http = await HttpService().init();
  Get.put(http);
  Get.put(ApiService());
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    final storage = Get.find<StorageService>();
    final initialRoute = storage.getToken().isNotEmpty ? AppRoutes.home : AppRoutes.login;

    return GetMaterialApp(
      title: '衣智链',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      initialRoute: initialRoute,
      getPages: AppPages.pages,
      defaultTransition: Transition.rightToLeft,
      transitionDuration: const Duration(milliseconds: 250),
    );
  }
}
