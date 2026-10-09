import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/gradient_text.dart';
import 'links.dart';
import 'section_keys.dart';

/// 页脚
class SiteFooter extends StatelessWidget {
  const SiteFooter({super.key});

  @override
  Widget build(BuildContext context) {
    final mobile = Breakpoints.isMobile(context);

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 60),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: AppColors.glassBorder),
        ),
      ),
      child: ContentBox(
        child: Column(
          children: [
            mobile
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: _footerColumns(context),
                  )
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: _footerColumns(context),
                  ),
            const SizedBox(height: 40),
            const Divider(color: AppColors.glassBorder, thickness: 0.5),
            const SizedBox(height: 24),
            Text(
              '© 2026 KOKO空空 KOKO · 元宇宙陪伴平台',
              textAlign: TextAlign.center,
              style: AppText.base(14, color: AppColors.textMuted),
            ),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: () => openExternal('https://beian.miit.gov.cn/'),
              child: Text(
                '闽ICP备2022005067号-10',
                textAlign: TextAlign.center,
                style: AppText.base(14, color: AppColors.textMuted),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _footerColumns(BuildContext context) {
    final mobile = Breakpoints.isMobile(context);
    final cols = [
      _FooterBrand(flex: mobile ? null : 2),
      _FooterCol(
        '产品',
        [
          ('电竞陪玩', () => SectionKeys.scrollTo(SectionKeys.pewan)),
          ('元宇宙礼物', () => SectionKeys.scrollTo(SectionKeys.gift)),
          ('核心功能', () => SectionKeys.scrollTo(SectionKeys.features)),
          ('立即下载', () => SectionKeys.scrollTo(SectionKeys.download)),
        ],
      ),
      _FooterCol(
        '合作',
        [
          ('打手入驻', () => openSitePath('/partner/')),
          ('公会入驻', () => openSitePath('/partner/')),
          ('IP入驻', () => openSitePath('/partner/')),
          ('网红达人合作', () => openSitePath('/partner/')),
        ],
      ),
      _FooterCol(
        '法律协议',
        [
          ('用户协议', () => openSitePath('/terms/')),
          ('隐私政策', () => openSitePath('/privacy/')),
          ('充值协议', () => openSitePath('/recharge/')),
          ('账号注销', () => openSitePath('/account-deletion/')),
          ('入驻服务协议', () => openSitePath('/partner-agreement/')),
          ('游戏上分保障', () => openSitePath('/ranking-guarantee/')),
        ],
      ),
      _FooterCol(
        '服务支持',
        [
          ('技术支持', () => openSitePath('/support/')),
          ('帮助中心', () => openSitePath('/help/')),
          ('青少年模式', () => openSitePath('/youth/')),
          ('平台服务规范', () => openSitePath('/service-standard/')),
          ('用户行为守则', () => openSitePath('/code-of-conduct/')),
        ],
      ),
    ];
    if (mobile) return cols;
    return cols
        .map((c) => Expanded(
              flex: c is _FooterBrand ? 2 : 1,
              child: c,
            ))
        .toList();
  }
}

class _FooterBrand extends StatelessWidget {
  final int? flex;
  const _FooterBrand({this.flex});

  @override
  Widget build(BuildContext context) {
    final child = Padding(
      padding: const EdgeInsets.only(bottom: 24, right: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.asset('assets/images/KOKO-logo.jpg', height: 40),
              ),
              const SizedBox(width: 12),
              GradientText(
                '空空',
                style: AppText.base(20, weight: FontWeight.w800, letterSpacing: 3),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            '你的元宇宙陪伴者。以电竞陪玩为核心，以元宇宙礼物开放平台为载体，打造有温度的虚拟社交空间。',
            style: AppText.base(14, color: AppColors.textSecondary, height: 1.7),
          ),
        ],
      ),
    );
    return flex == null
        ? child
        : Padding(
            padding: const EdgeInsets.only(right: 24),
            child: child,
          );
  }
}

class _FooterCol extends StatelessWidget {
  final String title;
  final List<(String, VoidCallback)> items;
  const _FooterCol(this.title, this.items);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24, right: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: AppText.base(14,
                  weight: FontWeight.w700, color: AppColors.textSecondary, letterSpacing: 1)),
          const SizedBox(height: 12),
          ...items.map(
            (it) => GestureDetector(
              onTap: it.$2,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: MouseRegion(
                  cursor: SystemMouseCursors.click,
                  child: Text(
                    it.$1,
                    style: AppText.base(14,
                        color: AppColors.textMuted,
                        height: 1.5),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
