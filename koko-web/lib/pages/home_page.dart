import 'package:flutter/material.dart';

import '../sections/business_section.dart';
import '../sections/cta_section.dart';
import '../sections/features_section.dart';
import '../sections/footer.dart';
import '../sections/hero_section.dart';
import '../sections/navbar.dart';
import '../sections/partner_section.dart';
import '../sections/section_keys.dart';
import '../sections/values_section.dart';
import '../theme.dart';
import '../widgets/starfield_background.dart';

/// 首页：固定导航 + 单页滚动板块
class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _scrollController = ScrollController();
  bool _scrolled = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(() {
      final s = _scrollController.offset > 50;
      if (s != _scrolled) setState(() => _scrolled = s);
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mobile = Breakpoints.isMobile(context);
    return Scaffold(
      backgroundColor: AppColors.deepBlue,
      endDrawer: mobile ? SiteNavbar.buildDrawer(context) : null,
      body: StarfieldBackground(
        child: Stack(
          children: [
            SingleChildScrollView(
              controller: _scrollController,
              child: const Column(
                children: [
                  HeroSection(),
                  FeaturesSection(),
                  PewanSection(),
                  GiftSection(),
                  PartnerSection(),
                  ValuesSection(),
                  CtaSection(),
                  SiteFooter(),
                ],
              ),
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: SiteNavbar(scrolled: _scrolled),
            ),
            if (mobile)
              Positioned(
                top: 20,
                right: 12,
                child: Builder(
                  builder: (ctx) => IconButton(
                    icon: const Icon(Icons.menu, color: AppColors.textPrimary),
                    onPressed: () => Scaffold.of(ctx).openEndDrawer(),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
