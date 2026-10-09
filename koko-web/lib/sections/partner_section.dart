import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/fade_in_on_visible.dart';
import '../widgets/glass_card.dart';
import '../widgets/gradient_text.dart';
import '../widgets/section_header.dart';
import 'links.dart';

/// 合作入驻四卡
class PartnerSection extends StatelessWidget {
  const PartnerSection({super.key});

  static const _items = [
    (
      '🎯',
      '打手入驻',
      '技术过硬、声音好听、性格有趣？加入KOKO空空陪玩大军，平台海量订单，灵活接单，收入上不封顶。认证审核通过即可上线接单。',
      '/partner/',
    ),
    (
      '🏢',
      '公会入驻',
      '电竞公会、陪玩工作室、MCN机构批量入驻。享受公会专属政策、订单倾斜、运营扶持、结算优惠，与KOKO空空共同成长。',
      '/partner/',
    ),
    (
      '🖼️',
      'IP入驻元宇宙礼物',
      '品牌方、动漫IP、游戏IP、艺术家、设计师均可入驻KOKO空空元宇宙礼物开放平台。你的IP变成独一无二的链上礼物，触达海量年轻用户。',
      '/partner/',
    ),
    (
      '📱',
      '网红达人对接',
      '抖音、快手、B站、小红书网红达人合作对接。内容种草、直播带货、联名活动、专属礼物，全链路赋能品牌曝光与用户增长。',
      '/partner/',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final cross = width > 900 ? 4 : (width > 600 ? 2 : 1);

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 100),
      child: ContentBox(
        child: Column(
          children: [
            const SectionHeader(
              tag: 'PARTNER PROGRAM',
              titleBefore: '合作',
              titleGradient: '入驻',
              description: 'KOKO空空开放平台，欢迎打手、公会、IP方、网红达人携手共建元宇宙陪伴生态',
            ),
            const SizedBox(height: 60),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: cross,
                mainAxisSpacing: 24,
                crossAxisSpacing: 24,
                childAspectRatio: cross == 1 ? 1.4 : 1.15,
              ),
              itemCount: _items.length,
              itemBuilder: (context, i) {
                final it = _items[i];
                return FadeInOnVisible(
                  delay: Duration(milliseconds: 100 * i),
                  child: _PartnerCard(
                    icon: it.$1,
                    title: it.$2,
                    desc: it.$3,
                    path: it.$4,
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _PartnerCard extends StatefulWidget {
  final String icon, title, desc, path;
  const _PartnerCard({
    required this.icon,
    required this.title,
    required this.desc,
    required this.path,
  });

  @override
  State<_PartnerCard> createState() => _PartnerCardState();
}

class _PartnerCardState extends State<_PartnerCard> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: () => openSitePath(widget.path),
        child: GlassCard(
          hoverable: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(widget.icon, style: const TextStyle(fontSize: 40)),
              const SizedBox(height: 16),
              Text(widget.title,
                  style: AppText.base(20, weight: FontWeight.w700)),
              const SizedBox(height: 10),
              Expanded(
                child: Text(widget.desc,
                    style: AppText.base(14, color: AppColors.textSecondary)),
              ),
              const SizedBox(height: 16),
              AnimatedDefaultTextStyle(
                duration: const Duration(milliseconds: 300),
                style: AppText.base(
                  14,
                  weight: FontWeight.w600,
                  color: _hover ? AppColors.neonCyan : AppColors.textPrimary,
                ),
                child: const Text('立即入驻 →'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
