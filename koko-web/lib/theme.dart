import 'package:flutter/material.dart';

/// KOKO 官网主题 —— 1:1 映射原站 CSS 变量（c:\官网html\KOKO\index.html :root）
class AppColors {
  AppColors._();

  static const deepBlue = Color(0xFF0A0906); // --deep-blue
  static const spaceBlue = Color(0xFF121008); // --space-blue
  static const nebulaPurple = Color(0xFFFFC107); // --nebula-purple
  static const neonCyan = Color(0xFFFFD54F); // --neon-cyan
  static const magicPink = Color(0xFFFF8F00); // --magic-pink
  static const textPrimary = Color(0xFFF7F2E4); // --text-primary
  static const textSecondary = Color(0xFFB8AE98); // --text-secondary
  static const textMuted = Color(0xFF7D7460); // --text-muted

  /// --glass-bg
  static const glassBg = Color.fromRGBO(30, 24, 8, 0.4);

  /// --glass-border
  static const glassBorder = Color.fromRGBO(255, 193, 7, 0.25);

  /// --gradient-main: linear-gradient(135deg, #ffd54f 0%, #ffc107 50%, #ff8f00 100%)
  static const gradientMain = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [neonCyan, nebulaPurple, magicPink],
    stops: [0.0, 0.5, 1.0],
  );

  /// --gradient-text: linear-gradient(135deg, #ffd54f, #ff8f00)
  static const gradientText = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [neonCyan, magicPink],
  );
}

class AppText {
  AppText._();

  static const fontFamilyFallback = [
    'PingFang SC',
    'Microsoft YaHei',
    'sans-serif',
  ];

  static TextStyle base(
    double size, {
    FontWeight weight = FontWeight.w400,
    Color color = AppColors.textPrimary,
    double height = 1.7,
    double? letterSpacing,
  }) {
    return TextStyle(
      fontSize: size,
      fontWeight: weight,
      color: color,
      height: height,
      letterSpacing: letterSpacing,
      fontFamilyFallback: fontFamilyFallback,
    );
  }
}

/// 响应式断点（对齐原站 900px / 500px）
class Breakpoints {
  Breakpoints._();
  static const double tablet = 900;
  static const double phone = 500;

  static bool isMobile(BuildContext context) =>
      MediaQuery.sizeOf(context).width <= tablet;
  static bool isSmallPhone(BuildContext context) =>
      MediaQuery.sizeOf(context).width <= phone;
}

/// 内容最大宽度（对齐原站 max-width: 1200px，padding 0 24px）
class ContentBox extends StatelessWidget {
  final Widget child;
  const ContentBox({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1200),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: child,
        ),
      ),
    );
  }
}
