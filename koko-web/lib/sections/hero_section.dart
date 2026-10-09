import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/gradient_text.dart';
import 'links.dart';
import 'section_keys.dart';

/// Hero：双列（文案 + 浮动 App 图标），移动端单列
class HeroSection extends StatefulWidget {
  const HeroSection({super.key});

  @override
  State<HeroSection> createState() => _HeroSectionState();
}

class _HeroSectionState extends State<HeroSection>
    with SingleTickerProviderStateMixin {
  late final AnimationController _float;

  @override
  void initState() {
    super.initState();
    _float = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _float.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mobile = Breakpoints.isMobile(context);
    final content = _HeroContent(mobile: mobile);
    final visual = _HeroVisual(float: _float, compact: mobile);

    return Container(
      key: SectionKeys.home,
      padding: EdgeInsets.only(top: mobile ? 120 : 160, bottom: mobile ? 60 : 100),
      child: ContentBox(
        child: mobile
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [visual, const SizedBox(height: 40), content],
              )
            : Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(child: content),
                  const SizedBox(width: 60),
                  Expanded(child: visual),
                ],
              ),
      ),
    );
  }
}

class _HeroContent extends StatelessWidget {
  final bool mobile;
  const _HeroContent({required this.mobile});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment:
          mobile ? CrossAxisAlignment.center : CrossAxisAlignment.start,
      children: [
        Text(
          'KOKO · 元宇宙陪伴平台',
          textAlign: mobile ? TextAlign.center : TextAlign.left,
          style: AppText.base(16,
              weight: FontWeight.w500,
              color: AppColors.textSecondary,
              letterSpacing: 2),
        ),
        const SizedBox(height: 20),
        RichText(
          textAlign: mobile ? TextAlign.center : TextAlign.left,
          text: TextSpan(
            style: AppText.base(mobile ? 40 : 56,
                weight: FontWeight.w800, height: 1.3),
            children: [
              const TextSpan(text: '你的'),
              WidgetSpan(
                alignment: PlaceholderAlignment.baseline,
                baseline: TextBaseline.alphabetic,
                child: GradientText(
                  '元宇宙',
                  style: AppText.base(mobile ? 40 : 56,
                      weight: FontWeight.w800, height: 1.3),
                ),
              ),
            ],
          ),
        ),
        Text(
          '陪伴者',
          textAlign: mobile ? TextAlign.center : TextAlign.left,
          style: AppText.base(mobile ? 40 : 56,
              weight: FontWeight.w800, height: 1.3),
        ),
        const SizedBox(height: 20),
        Text(
          '虚空有灵 · 陪伴有声',
          textAlign: mobile ? TextAlign.center : TextAlign.left,
          style: AppText.base(20, color: AppColors.textSecondary, letterSpacing: 4),
        ),
        const SizedBox(height: 40),
        Wrap(
          spacing: 16,
          runSpacing: 16,
          alignment: mobile ? WrapAlignment.center : WrapAlignment.start,
          children: [
            _PrimaryButton(
              label: '立即下载',
              icon: '⬇',
              onTap: () => SectionKeys.scrollTo(SectionKeys.download),
            ),
            _OutlineButton(
              label: '合作入驻',
              icon: '🤝',
              onTap: () => openSitePath('/partner/'),
            ),
          ],
        ),
      ],
    );
  }
}

class _HeroVisual extends StatelessWidget {
  final Animation<double> float;
  final bool compact;
  const _HeroVisual({required this.float, required this.compact});

  @override
  Widget build(BuildContext context) {
    final size = compact ? 200.0 : 280.0;
    return AnimatedBuilder(
      animation: float,
      builder: (context, child) {
        final dy = math.sin(float.value * math.pi) * 12;
        return Transform.translate(offset: Offset(0, dy), child: child);
      },
      child: SizedBox(
        height: size + 120,
        child: Stack(
          alignment: Alignment.center,
          clipBehavior: Clip.none,
          children: [
            // 光晕
            Container(
              width: size * 1.4,
              height: size * 1.4,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    AppColors.nebulaPurple.withValues(alpha: 0.25),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(size * 0.24),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.nebulaPurple.withValues(alpha: 0.5),
                    blurRadius: 60,
                    spreadRadius: 4,
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(size * 0.24),
                child: Image.asset('assets/images/KOKO-logo.jpg',
                    width: size, height: size),
              ),
            ),
            if (!compact) ...[
              _badge('🎮 海量认证陪玩', const Offset(-150, -120)),
              _badge('🎁 元宇宙礼物', const Offset(160, -40)),
              _badge('🌌 沉浸式社交', const Offset(-140, 110)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _badge(String text, Offset offset) {
    return Transform.translate(
      offset: offset,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.glassBg,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.glassBorder),
        ),
        child: Text(text, style: AppText.base(14, weight: FontWeight.w500)),
      ),
    );
  }
}

/// 主按钮（渐变底）
class _PrimaryButton extends StatefulWidget {
  final String label;
  final String icon;
  final VoidCallback onTap;
  const _PrimaryButton(
      {required this.label, required this.icon, required this.onTap});

  @override
  State<_PrimaryButton> createState() => _PrimaryButtonState();
}

class _PrimaryButtonState extends State<_PrimaryButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          transform: Matrix4.translationValues(0, _hover ? -3 : 0, 0),
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
          decoration: BoxDecoration(
            gradient: AppColors.gradientMain,
            borderRadius: BorderRadius.circular(30),
            boxShadow: [
              BoxShadow(
                color: AppColors.nebulaPurple.withValues(alpha: _hover ? 0.6 : 0.4),
                blurRadius: _hover ? 36 : 24,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Text(
            '${widget.icon} ${widget.label}',
            style: AppText.base(17,
                weight: FontWeight.w600, color: Colors.white, height: 1.2),
          ),
        ),
      ),
    );
  }
}

/// 次按钮（描边）
class _OutlineButton extends StatefulWidget {
  final String label;
  final String icon;
  final VoidCallback onTap;
  const _OutlineButton(
      {required this.label, required this.icon, required this.onTap});

  @override
  State<_OutlineButton> createState() => _OutlineButtonState();
}

class _OutlineButtonState extends State<_OutlineButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          transform: Matrix4.translationValues(0, _hover ? -3 : 0, 0),
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
          decoration: BoxDecoration(
            color: _hover
                ? AppColors.nebulaPurple.withValues(alpha: 0.12)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(30),
            border: Border.all(
              color: AppColors.nebulaPurple.withValues(alpha: 0.6),
              width: 1.5,
            ),
          ),
          child: Text(
            '${widget.icon} ${widget.label}',
            style: AppText.base(17,
                weight: FontWeight.w600, color: AppColors.neonCyan, height: 1.2),
          ),
        ),
      ),
    );
  }
}
