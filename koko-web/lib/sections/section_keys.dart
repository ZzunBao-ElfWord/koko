import 'package:flutter/material.dart';

/// 首页各板块锚点（对齐原站 #home #features #pewan #gift #download）
class SectionKeys {
  SectionKeys._();

  static final home = GlobalKey();
  static final features = GlobalKey();
  static final pewan = GlobalKey();
  static final gift = GlobalKey();
  static final download = GlobalKey();

  static void scrollTo(GlobalKey key) {
    final ctx = key.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 600),
        curve: Curves.easeInOut,
      );
    }
  }
}
