import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/fade_in_on_visible.dart';
import '../widgets/gradient_text.dart';
import 'links.dart';
import 'section_keys.dart';

/// CTA 下载区
class CtaSection extends StatelessWidget {
  const CtaSection({super.key});

  @override
  Widget build(BuildContext context) {
    final mobile = Breakpoints.isMobile(context);

    return Container(
      key: SectionKeys.download,
      padding: const EdgeInsets.symmetric(vertical: 100),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.transparent,
            AppColors.nebulaPurple.withValues(alpha: 0.06),
          ],
        ),
      ),
      child: ContentBox(
        child: FadeInOnVisible(
          child: Column(
            children: [
              Text(
                '开启你的',
                textAlign: TextAlign.center,
                style: AppText.base(
                  mobile ? 28 : 40,
                  weight: FontWeight.w800,
                  height: 1.3,
                ),
              ),
              GradientText(
                '元宇宙陪伴',
                style: AppText.base(
                  mobile ? 28 : 40,
                  weight: FontWeight.w800,
                  height: 1.3,
                ),
              ),
              Text(
                '之旅',
                textAlign: TextAlign.center,
                style: AppText.base(
                  mobile ? 28 : 40,
                  weight: FontWeight.w800,
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                '虚空有灵，陪伴有声。下载KOKO空空，遇见懂你的陪伴。',
                textAlign: TextAlign.center,
                style: AppText.base(17, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 40),
              Wrap(
                spacing: 16,
                runSpacing: 16,
                alignment: WrapAlignment.center,
                children: [
                  _CtaButton(
                    label: 'App Store 即将上线',
                    icon: '🍎',
                    enabled: false,
                    onTap: () {},
                  ),
                  _CtaButton(
                    label: '安卓下载',
                    icon: '🤖',
                    onTap: () => openSitePath('/download/KOKO.apk'),
                  ),
                  _CtaButton(
                    label: 'Windows 下载',
                    icon: '🪟',
                    onTap: () => openSitePath('/download/KOKO_Setup.exe'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CtaButton extends StatefulWidget {
  final String label;
  final String icon;
  final bool enabled;
  final VoidCallback onTap;
  const _CtaButton({
    required this.label,
    required this.icon,
    this.enabled = true,
    required this.onTap,
  });

  @override
  State<_CtaButton> createState() => _CtaButtonState();
}

class _CtaButtonState extends State<_CtaButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final opacity = widget.enabled ? 1.0 : 0.6;
    return Opacity(
      opacity: opacity,
      child: MouseRegion(
        cursor: widget.enabled
            ? SystemMouseCursors.click
            : SystemMouseCursors.forbidden,
        onEnter: widget.enabled ? (_) => setState(() => _hover = true) : null,
        onExit: widget.enabled ? (_) => setState(() => _hover = false) : null,
        child: GestureDetector(
          onTap: widget.enabled ? widget.onTap : null,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            transform: Matrix4.translationValues(0, _hover ? -3 : 0, 0),
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
            decoration: BoxDecoration(
              gradient: widget.enabled ? AppColors.gradientMain : null,
              color: widget.enabled
                  ? null
                  : AppColors.spaceBlue.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(30),
              border: widget.enabled
                  ? null
                  : Border.all(color: AppColors.glassBorder),
              boxShadow: widget.enabled
                  ? [
                      BoxShadow(
                        color: AppColors.nebulaPurple
                            .withValues(alpha: _hover ? 0.5 : 0.3),
                        blurRadius: _hover ? 36 : 24,
                        offset: const Offset(0, 6),
                      ),
                    ]
                  : null,
            ),
            child: Text(
              '${widget.icon} ${widget.label}',
              style: AppText.base(
                17,
                weight: FontWeight.w600,
                color: widget.enabled ? Colors.white : AppColors.textMuted,
                height: 1.2,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
