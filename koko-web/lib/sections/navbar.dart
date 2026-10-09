import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/gradient_text.dart';
import 'links.dart';
import 'section_keys.dart';

/// 固定顶栏：桌面横排链接 + 移动端 Drawer；滚动时加深背景
class SiteNavbar extends StatelessWidget {
  final bool scrolled;
  const SiteNavbar({super.key, required this.scrolled});

  @override
  Widget build(BuildContext context) {
    final mobile = Breakpoints.isMobile(context);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      padding: EdgeInsets.symmetric(vertical: scrolled ? 12 : 16),
      decoration: BoxDecoration(
        color: AppColors.deepBlue.withValues(alpha: scrolled ? 0.92 : 0.75),
        border: Border(
          bottom: BorderSide(
            color: AppColors.nebulaPurple.withValues(alpha: 0.15),
          ),
        ),
        boxShadow: scrolled
            ? [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.3),
                  blurRadius: 30,
                  offset: const Offset(0, 4),
                ),
              ]
            : null,
      ),
      child: ContentBox(
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _logo(),
            if (!mobile) _desktopLinks(context),
          ],
        ),
      ),
    );
  }

  Widget _logo() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            boxShadow: [
              BoxShadow(
                color: AppColors.nebulaPurple.withValues(alpha: 0.45),
                blurRadius: 20,
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.asset('assets/images/KOKO-logo.jpg', height: 40),
          ),
        ),
        const SizedBox(width: 12),
        GradientText(
          '空空',
          style: AppText.base(20, weight: FontWeight.w800, letterSpacing: 3),
        ),
      ],
    );
  }

  Widget _desktopLinks(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _NavLink('首页', () => SectionKeys.scrollTo(SectionKeys.home)),
        _NavLink('核心功能', () => SectionKeys.scrollTo(SectionKeys.features)),
        _NavLink('电竞陪玩', () => SectionKeys.scrollTo(SectionKeys.pewan)),
        _NavLink('元宇宙礼物', () => SectionKeys.scrollTo(SectionKeys.gift)),
        _NavLink('合作入驻', () => openSitePath('/partner/')),
        const SizedBox(width: 8),
        _DownloadButton(onTap: () => SectionKeys.scrollTo(SectionKeys.download)),
      ],
    );
  }

  /// 移动端 Drawer 内容（供 Scaffold 使用）
  static Drawer buildDrawer(BuildContext context) {
    return Drawer(
      backgroundColor: AppColors.spaceBlue,
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(vertical: 24),
          children: [
            _drawerItem(context, '首页', () => SectionKeys.scrollTo(SectionKeys.home)),
            _drawerItem(context, '核心功能', () => SectionKeys.scrollTo(SectionKeys.features)),
            _drawerItem(context, '电竞陪玩', () => SectionKeys.scrollTo(SectionKeys.pewan)),
            _drawerItem(context, '元宇宙礼物', () => SectionKeys.scrollTo(SectionKeys.gift)),
            _drawerItem(context, '合作入驻', () => openSitePath('/partner/')),
            _drawerItem(context, '立即下载', () => SectionKeys.scrollTo(SectionKeys.download)),
          ],
        ),
      ),
    );
  }

  static Widget _drawerItem(BuildContext context, String label, VoidCallback onTap) {
    return ListTile(
      title: Text(label, style: AppText.base(16, weight: FontWeight.w500)),
      onTap: () {
        Navigator.of(context).pop();
        onTap();
      },
    );
  }
}

class _NavLink extends StatefulWidget {
  final String label;
  final VoidCallback onTap;
  const _NavLink(this.label, this.onTap);

  @override
  State<_NavLink> createState() => _NavLinkState();
}

class _NavLinkState extends State<_NavLink> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: AnimatedDefaultTextStyle(
            duration: const Duration(milliseconds: 300),
            style: AppText.base(
              15,
              weight: FontWeight.w500,
              color: _hover ? AppColors.neonCyan : AppColors.textSecondary,
              height: 1.2,
            ),
            child: Text(widget.label),
          ),
        ),
      ),
    );
  }
}

class _DownloadButton extends StatefulWidget {
  final VoidCallback onTap;
  const _DownloadButton({required this.onTap});

  @override
  State<_DownloadButton> createState() => _DownloadButtonState();
}

class _DownloadButtonState extends State<_DownloadButton> {
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
          transform: Matrix4.translationValues(0, _hover ? -2 : 0, 0),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
          decoration: BoxDecoration(
            gradient: AppColors.gradientMain,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: AppColors.nebulaPurple.withValues(alpha: _hover ? 0.6 : 0.4),
                blurRadius: _hover ? 30 : 20,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Text(
            '立即下载',
            style: AppText.base(15, weight: FontWeight.w600, color: Colors.white, height: 1.2),
          ),
        ),
      ),
    );
  }
}
