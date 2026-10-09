import 'package:flutter/material.dart';
import '../theme.dart';

/// 玻璃拟态容器（复刻 --glass-bg + --glass-border + 圆角 + hover 上浮）
class GlassCard extends StatefulWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final bool hoverable;

  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(32),
    this.radius = 20,
    this.hoverable = true,
  });

  @override
  State<GlassCard> createState() => _GlassCardState();
}

class _GlassCardState extends State<GlassCard> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: widget.hoverable ? (_) => setState(() => _hover = true) : null,
      onExit: widget.hoverable ? (_) => setState(() => _hover = false) : null,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        transform: Matrix4.translationValues(0, _hover ? -6 : 0, 0),
        padding: widget.padding,
        decoration: BoxDecoration(
          color: AppColors.glassBg,
          borderRadius: BorderRadius.circular(widget.radius),
          border: Border.all(
            color: _hover
                ? AppColors.nebulaPurple.withValues(alpha: 0.5)
                : AppColors.glassBorder,
          ),
          boxShadow: _hover
              ? [
                  BoxShadow(
                    color: AppColors.nebulaPurple.withValues(alpha: 0.15),
                    blurRadius: 30,
                    offset: const Offset(0, 12),
                  ),
                ]
              : null,
        ),
        child: widget.child,
      ),
    );
  }
}
