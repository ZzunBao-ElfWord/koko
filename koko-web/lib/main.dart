import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:go_router/go_router.dart';

import 'pages/home_page.dart';
import 'theme.dart';

void main() {
  usePathUrlStrategy();
  runApp(const KokoWebApp());
}

final _router = GoRouter(
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const HomePage(),
    ),
  ],
);

class KokoWebApp extends StatelessWidget {
  const KokoWebApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'KOKO空空 - 元宇宙陪伴平台 | 虚空有灵，陪伴有声',
      debugShowCheckedModeBanner: false,
      routerConfig: _router,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.deepBlue,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.nebulaPurple,
          brightness: Brightness.dark,
        ),
        fontFamilyFallback: AppText.fontFamilyFallback,
      ),
    );
  }
}
