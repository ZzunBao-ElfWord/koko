import 'dart:math' as math;

import 'package:flutter/material.dart';

/// 星光背景（复刻原站 .stars-bg：金色光晕 + 闪烁星点）
class StarfieldBackground extends StatefulWidget {
  final Widget child;
  const StarfieldBackground({super.key, required this.child});

  @override
  State<StarfieldBackground> createState() => _StarfieldBackgroundState();
}

class _StarfieldBackgroundState extends State<StarfieldBackground>
    with SingleTickerProviderStateMixin {
  late final AnimationController _twinkle;

  @override
  void initState() {
    super.initState();
    _twinkle = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 6),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _twinkle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // 金色光晕
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(-0.6, -0.6),
                radius: 1.2,
                colors: [
                  const Color(0xFFFFC107).withValues(alpha: 0.15),
                  Colors.transparent,
                ],
              ),
            ),
          ),
        ),
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0.6, 0.6),
                radius: 1.2,
                colors: [
                  const Color(0xFFFF8F00).withValues(alpha: 0.10),
                  Colors.transparent,
                ],
              ),
            ),
          ),
        ),
        // 星点（闪烁）
        Positioned.fill(
          child: AnimatedBuilder(
            animation: _twinkle,
            builder: (context, _) => CustomPaint(
              painter: _StarsPainter(opacity: 0.4 + 0.5 * _twinkle.value),
            ),
          ),
        ),
        widget.child,
      ],
    );
  }
}

class _StarsPainter extends CustomPainter {
  final double opacity;
  _StarsPainter({required this.opacity});

  @override
  void paint(Canvas canvas, Size size) {
    final rng = math.Random(42);
    final paint = Paint();
    for (var i = 0; i < 120; i++) {
      final dx = rng.nextDouble() * size.width;
      final dy = rng.nextDouble() * size.height;
      final r = rng.nextDouble() * 1.2 + 0.4;
      final golden = rng.nextDouble() < 0.15;
      paint.color = (golden ? const Color(0xFFFFD54F) : Colors.white)
          .withValues(alpha: opacity * (0.4 + rng.nextDouble() * 0.6));
      canvas.drawCircle(Offset(dx, dy), r, paint);
    }
  }

  @override
  bool shouldRepaint(_StarsPainter old) => old.opacity != opacity;
}
