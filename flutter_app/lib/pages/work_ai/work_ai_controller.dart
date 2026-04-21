import 'dart:convert';
import 'package:get/get.dart';
import '../../utils/api_service.dart';

class InsightCard {
  final String title;
  final String? summary;
  final String? painPoint;
  final String? execute;
  final String level;
  final List<String> evidence;
  final String? confidence;
  final String? source;
  InsightCard({required this.title, this.summary, this.painPoint, this.execute, this.level = 'info', this.evidence = const [], this.confidence, this.source});
}

class ChatMessage {
  final String content;
  final bool isUser;
  final DateTime time;
  final List<InsightCard> insightCards;
  final List<String> clarificationHints;
  final List<Map<String, dynamic>> actionCards;
  ChatMessage({required this.content, required this.isUser, required this.time, this.insightCards = const [], this.clarificationHints = const [], this.actionCards = const []});
}

class ParsedAiReply {
  final String displayText;
  final List<InsightCard> insightCards;
  final List<String> clarificationHints;
  final List<Map<String, dynamic>> actionCards;
  ParsedAiReply({required this.displayText, this.insightCards = const [], this.clarificationHints = const [], this.actionCards = const []});
}

ParsedAiReply _parseAiReply(String rawText) {
  if (rawText.isEmpty) return ParsedAiReply(displayText: '');

  String text = rawText;
  final insightCards = <InsightCard>[];
  final clarificationHints = <String>[];
  final actionCards = <Map<String, dynamic>>[];

  final tagPattern = RegExp(r'【(\w+)】([\s\S]*?)【\/\1】');
  final matches = tagPattern.allMatches(rawText);

  for (final match in matches) {
    final tag = match.group(1);
    final body = match.group(2)?.trim() ?? '';
    try {
      final parsed = jsonDecode(body);
      if (tag == 'INSIGHT_CARDS') {
        final list = parsed is List ? parsed : [parsed];
        for (final item in list) {
          if (item is Map && item['title'] != null) {
            insightCards.add(InsightCard(
              title: item['title'].toString(),
              summary: item['summary']?.toString(),
              painPoint: item['painPoint']?.toString(),
              execute: item['execute']?.toString(),
              level: item['level']?.toString() ?? 'info',
              evidence: (item['evidence'] as List?)?.map((e) => e.toString()).toList() ?? [],
              confidence: item['confidence']?.toString(),
              source: item['source']?.toString(),
            ));
          }
        }
      } else if (tag == 'CLARIFICATION') {
        if (parsed is List) {
          clarificationHints.addAll(parsed.map((e) => e.toString()));
        }
      } else if (tag == 'ACTIONS') {
        final list = parsed is List ? parsed : (parsed is Map && parsed['actions'] != null ? parsed['actions'] as List : [parsed]);
        for (final item in list) {
          if (item is Map && item['title'] != null) {
            actionCards.add(Map<String, dynamic>.from(item));
          }
        }
      }
    } catch (_) {}
  }

  text = text.replaceAll(tagPattern, '');
  text = text.replaceAll(RegExp(r'```ACTIONS_JSON\s*\n[\s\S]*?\n```'), '');
  text = text.trim();

  return ParsedAiReply(displayText: text, insightCards: insightCards, clarificationHints: clarificationHints, actionCards: actionCards);
}

class WorkAiController extends GetxController {
  final ApiService _api = Get.find<ApiService>();
  final messages = <ChatMessage>[].obs;
  final inputText = ''.obs;
  final sending = false.obs;

  Future<void> sendMessage() async {
    final text = inputText.value.trim();
    if (text.isEmpty) return;
    messages.add(ChatMessage(content: text, isUser: true, time: DateTime.now()));
    inputText.value = '';
    sending.value = true;

    try {
      final res = await _api.aiAdvisorChat({'question': text});
      final data = res.data;
      if (data is Map && data['code'] == 200 && data['data'] != null) {
        final rawReply = data['data']['reply']?.toString() ?? data['data']['content']?.toString() ?? '收到';
        final parsed = _parseAiReply(rawReply);
        messages.add(ChatMessage(
          content: parsed.displayText,
          isUser: false,
          time: DateTime.now(),
          insightCards: parsed.insightCards,
          clarificationHints: parsed.clarificationHints,
          actionCards: parsed.actionCards,
        ));
      } else {
        messages.add(ChatMessage(content: '抱歉，暂时无法回复', isUser: false, time: DateTime.now()));
      }
    } catch (e) {
      messages.add(ChatMessage(content: '网络异常，请稍后重试', isUser: false, time: DateTime.now()));
    } finally {
      sending.value = false;
    }
  }
}
