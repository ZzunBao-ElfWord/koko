import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/fade_in_on_visible.dart';
import 'links.dart';
import 'section_keys.dart';

/// 业务详情板块通用结构（左图右文 / 右图左文），供电竞陪玩与元宇宙礼物复用
class BusinessSection extends StatelessWidget {
  final GlobalKey? anchorKey;
  final String image;
  final String tag;
  final Color tagColor;
  final String title;
  final String description;
  final List<String> points;
  final List<(String, String, bool)> ctas; // (label, path, primary)
  final bool reverse;

  const BusinessSection({
    super.key,
    this.anchorKey,
    required this.image,
    required this.tag,
    required this.tagColor,
    required this.title,
    required this.description,
    required this.points,
    required this.ctas,
    this.reverse = false,
  });

  @override
  Widget build(BuildContext context) {
    final mobile = Breakpoints.isMobile(context);
    final imageWidget = _BusinessImage(image: image);
    final contentWidget = _BusinessContent(
      tag: tag,
      tagColor: tagColor,
      title: title,
      description: description,
      points: points,
      ctas: ctas,
      mobile: mobile,
    );

    return Container(
      key: anchorKey,
      padding: const EdgeInsets.symmetric(vertical: 80),
      child: ContentBox(
        child: FadeInOnVisible(
          child: mobile
              ? Column(
                  children: [
                    imageWidget,
                    const SizedBox(height: 40),
                    contentWidget,
                  ],
                )
              : Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: reverse
                      ? [
                          Expanded(child: contentWidget),
                          const SizedBox(width: 60),
                          Expanded(child: imageWidget),
                        ]
                      : [
                          Expanded(child: imageWidget),
                          const SizedBox(width: 60),
                          Expanded(child: contentWidget),
                        ],
                ),
        ),
      ),
    );
  }
}

class _BusinessImage extends StatelessWidget {
  final String image;
  const _BusinessImage({required this.image});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.glassBorder),
        boxShadow: [
          BoxShadow(
            color: AppColors.nebulaPurple.withValues(alpha: 0.2),
            blurRadius: 50,
            offset: const Offset(0, 20),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Image.asset(image, fit: BoxFit.cover),
      ),
    );
  }
}

class _BusinessContent extends StatelessWidget {
  final String tag;
  final Color tagColor;
  final String title;
  final String description;
  final List<String> points;
  final List<(String, String, bool)> ctas;
  final bool mobile;

  const _BusinessContent({
    required this.tag,
    required this.tagColor,
    required this.title,
    required this.description,
    required this.points,
    required this.ctas,
    required this.mobile,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment:
          mobile ? CrossAxisAlignment.center : CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: tagColor.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: tagColor.withValues(alpha: 0.4)),
          ),
          child: Text(tag,
              style: AppText.base(14, weight: FontWeight.w600, color: tagColor)),
        ),
        const SizedBox(height: 20),
        Text(
          title,
          textAlign: mobile ? TextAlign.center : TextAlign.left,
          style: AppText.base(mobile ? 28 : 36, weight: FontWeight.w800, height: 1.4),
        ),
        const SizedBox(height: 16),
        Text(
          description,
          textAlign: mobile ? TextAlign.center : TextAlign.left,
          style: AppText.base(16, color: AppColors.textSecondary),
        ),
        const SizedBox(height: 24),
        ...points.map(
          (p) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: mobile ? MainAxisSize.min : MainAxisSize.max,
              children: [
                const Text('✦ ',
                    style: TextStyle(color: AppColors.neonCyan, fontSize: 15, height: 1.7)),
                Flexible(
                  child: Text(p,
                      style: AppText.base(15, color: AppColors.textSecondary)),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        Wrap(
          spacing: 16,
          runSpacing: 12,
          alignment: mobile ? WrapAlignment.center : WrapAlignment.start,
          children: ctas
              .map((c) => _SmallButton(label: c.$1, path: c.$2, primary: c.$3))
              .toList(),
        ),
      ],
    );
  }
}

class _SmallButton extends StatefulWidget {
  final String label;
  final String path;
  final bool primary;
  const _SmallButton({required this.label, required this.path, required this.primary});

  @override
  State<_SmallButton> createState() => _SmallButtonState();
}

class _SmallButtonState extends State<_SmallButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: () => openSitePath(widget.path),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          transform: Matrix4.translationValues(0, _hover ? -2 : 0, 0),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          decoration: BoxDecoration(
            gradient: widget.primary ? AppColors.gradientMain : null,
            color: widget.primary
                ? null
                : (_hover
                    ? AppColors.nebulaPurple.withValues(alpha: 0.12)
                    : Colors.transparent),
            borderRadius: BorderRadius.circular(24),
            border: widget.primary
                ? null
                : Border.all(color: AppColors.nebulaPurple.withValues(alpha: 0.6)),
            boxShadow: widget.primary
                ? [
                    BoxShadow(
                      color: AppColors.nebulaPurple.withValues(alpha: _hover ? 0.5 : 0.3),
                      blurRadius: _hover ? 24 : 16,
                      offset: const Offset(0, 4),
                    ),
                  ]
                : null,
          ),
          child: Text(
            widget.label,
            style: AppText.base(
              15,
              weight: FontWeight.w600,
              color: widget.primary ? Colors.white : AppColors.neonCyan,
              height: 1.2,
            ),
          ),
        ),
      ),
    );
  }
}

/// 电竞陪玩详情
class PewanSection extends StatelessWidget {
  const PewanSection({super.key});

  @override
  Widget build(BuildContext context) {
    return BusinessSection(
      anchorKey: SectionKeys.pewan,
      image: 'assets/images/pewan.jpg',
      tag: '🎮 电竞陪玩',
      tagColor: AppColors.neonCyan,
      title: '上分有队友，\n孤独有KOKO空空',
      description: '专业电竞陪玩平台，主流游戏全覆盖。无论是想冲分上段，还是只想有人陪你聊聊天打打游戏，KOKO空空都能为你精准匹配最合适的陪伴者。',
      points: const [
        '海量认证陪玩，技术/声音/性格多维筛选',
        '实时匹配秒开黑，不等待不尴尬',
        '平台担保交易，安全有保障',
        '不止陪玩，更是懂你的游戏伙伴',
      ],
      ctas: const [
        ('🎯 打手入驻', '/partner/', true),
        ('🏢 公会入驻', '/partner/', false),
      ],
    );
  }
}

/// 元宇宙礼物详情
class GiftSection extends StatelessWidget {
  const GiftSection({super.key});

  @override
  Widget build(BuildContext context) {
    return BusinessSection(
      anchorKey: SectionKeys.gift,
      image: 'assets/images/gift.jpg',
      tag: '🎁 元宇宙礼物开放平台',
      tagColor: AppColors.magicPink,
      title: '每一份心意，\n都独一无二',
      description: 'KOKO空空元宇宙礼物开放平台，面向全球IP开放入驻。提供丰富多样的虚拟礼物，链上确权不可篡改，每一份礼物都承载着专属心意。送花会谢，元宇宙礼物永远闪耀。',
      points: const [
        '开放IP入驻，品牌/动漫/游戏/艺术家均可合作',
        '丰富虚拟礼物库，装饰/特效/限定多品类持续上新',
        '链上确权，每一份礼物独一无二不可篡改',
        '送礼/收藏/展示多元玩法，与陪玩场景深度联动',
      ],
      ctas: const [
        ('🖼️ IP入驻开放平台', '/partner/', true),
      ],
      reverse: true,
    );
  }
}
