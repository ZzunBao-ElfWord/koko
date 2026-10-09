import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/fade_in_on_visible.dart';
import '../widgets/glass_card.dart';
import '../widgets/section_header.dart';
import 'section_keys.dart';

/// 三大核心功能
class FeaturesSection extends StatelessWidget {
  const FeaturesSection({super.key});

  static const _items = [
    (
      '🎮',
      '电竞陪玩',
      '覆盖王者荣耀、英雄联盟、和平精英、原神等主流游戏。海量认证陪玩，大神/萌妹/声控多维筛选，技术carry+暖心陪伴，随时组队开黑。打手、公会火热入驻中。',
    ),
    (
      '🎁',
      '元宇宙礼物开放平台',
      '开放IP入驻的元宇宙礼物平台，装饰/特效/限定多品类持续上新。链上确权独一无二，送礼/收藏/展示多元玩法，与陪玩场景深度联动，打赏表白纪念一应俱全。',
    ),
    (
      '🌌',
      '元宇宙社交',
      '虚拟空间实时互动，找到懂你的同好。从一对一陪伴到群体共鸣，打造专属数字社交圈，让每一次相遇都是灵魂的共振。',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final crossAxisCount = width > 900 ? 3 : (width > 600 ? 2 : 1);

    return Container(
      key: SectionKeys.features,
      padding: const EdgeInsets.symmetric(vertical: 100),
      child: ContentBox(
        child: Column(
          children: [
            const SectionHeader(
              tag: 'CORE FEATURES',
              titleBefore: '三大核心',
              titleGradient: '功能',
              description: '以电竞陪玩为入口，以元宇宙礼物开放平台为载体，构建沉浸式虚拟社交空间',
            ),
            const SizedBox(height: 60),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: crossAxisCount,
                mainAxisSpacing: 24,
                crossAxisSpacing: 24,
                childAspectRatio: crossAxisCount == 1 ? 1.6 : 0.95,
              ),
              itemCount: _items.length,
              itemBuilder: (context, i) {
                final item = _items[i];
                return FadeInOnVisible(
                  delay: Duration(milliseconds: 100 * i),
                  child: GlassCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(item.$1, style: const TextStyle(fontSize: 44)),
                        const SizedBox(height: 20),
                        Text(item.$2,
                            style: AppText.base(22, weight: FontWeight.w700, height: 1.3)),
                        const SizedBox(height: 12),
                        Flexible(
                          child: Text(item.$3,
                              style: AppText.base(15, color: AppColors.textSecondary)),
                        ),
                      ],
                    ),
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
