import 'package:flutter/material.dart';

import '../theme.dart';
import 'fade_in_on_visible.dart';
import 'gradient_text.dart';

/// 板块头：tag + 渐变标题 + 描述
class SectionHeader extends StatelessWidget {
  final String tag;
  final String titleBefore;
  final String titleGradient;
  final String description;

  const SectionHeader({
    super.key,
    required this.tag,
    required this.titleBefore,
    required this.titleGradient,
    required this.description,
  });

  @override
  Widget build(BuildContext context) {
    final mobile = Breakpoints.isMobile(context);
    return FadeInOnVisible(
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
              tag,
              style: AppText.base(13,
                  weight: FontWeight.w600,
                  color: AppColors.neonCyan,
                  letterSpacing: 2),
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                titleBefore,
                style: AppText.base(mobile ? 30 : 40, weight: FontWeight.w800, height: 1.3),
              ),
              GradientText(
                titleGradient,
                style: AppText.base(mobile ? 30 : 40, weight: FontWeight.w800, height: 1.3),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: Text(
              description,
              textAlign: TextAlign.center,
              style: AppText.base(16, color: AppColors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}
