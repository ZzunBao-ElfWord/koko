import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/fade_in_on_visible.dart';
import '../widgets/gradient_text.dart';

/// 核心价值四卡
class ValuesSection extends StatelessWidget {
  const ValuesSection({super.key});

  static const _items = [
    ('💝', '陪伴感', '打破孤独，随时有人懂你\n7×24小时匹配'),
    ('🚀', '沉浸感', '元宇宙级别虚拟交互体验\n身临其境的社交'),
    ('💎', '专属感', '元宇宙礼物链上确权\n每一份心意永久铭记'),
    ('👥', '社群感', '电竞同好聚集地\n从一对一到群体共鸣'),
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
            FadeInOnVisible(
              child: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.nebulaPurple.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.glassBorder),
                    ),
                    child: Text(
                      'WHY KOKO',
                      style: AppText.base(13,
                          weight: FontWeight.w600,
                          color: AppColors.neonCyan,
                          letterSpacing: 2),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    alignment: WrapAlignment.center,
                    children: [
                      Text(
                        '为什么选择',
                        style: AppText.base(
                            width > 900 ? 40 : 30, weight: FontWeight.w800, height: 1.3),
                      ),
                      GradientText(
                        'KOKO空空',
                        style: AppText.base(
                            width > 900 ? 40 : 30, weight: FontWeight.w800, height: 1.3),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '不做冷冰冰的匹配平台，做懂你的数字伙伴',
                    textAlign: TextAlign.center,
                    style: AppText.base(16, color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 60),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: cross,
                mainAxisSpacing: 24,
                crossAxisSpacing: 24,
                childAspectRatio: cross == 1 ? 1.4 : 1.1,
              ),
              itemCount: _items.length,
              itemBuilder: (context, i) {
                final it = _items[i];
                return FadeInOnVisible(
                  delay: Duration(milliseconds: 100 * i),
                  child: Container(
                    padding: const EdgeInsets.all(32),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.glassBorder),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(it.$1, style: const TextStyle(fontSize: 36)),
                        const SizedBox(height: 16),
                        Text(it.$2,
                            style: AppText.base(20, weight: FontWeight.w700)),
                        const SizedBox(height: 10),
                        Text(it.$3,
                            style: AppText.base(14, color: AppColors.textSecondary)),
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
