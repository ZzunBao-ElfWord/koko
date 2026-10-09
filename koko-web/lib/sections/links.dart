import 'package:url_launcher/url_launcher.dart';

/// 站内合规文档/外部链接：同源路径用当前标签页跳转（交给 Caddy 伺服静态 HTML）
Future<void> openSitePath(String path) async {
  await launchUrl(Uri.parse(path), webOnlyWindowName: '_self');
}

Future<void> openExternal(String url) async {
  await launchUrl(Uri.parse(url), webOnlyWindowName: '_blank');
}
