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

class OverdueFactoryOrder {
  final String orderNo;
  final String? styleNo;
  final int progress;
  final int overdueDays;
  final int quantity;
  final String? plannedEndDate;
  OverdueFactoryOrder({required this.orderNo, this.styleNo, this.progress = 0, this.overdueDays = 0, this.quantity = 0, this.plannedEndDate});
}

class OverdueFactoryGroup {
  final String factoryName;
  final int totalOrders;
  final int totalQuantity;
  final int avgProgress;
  final int avgOverdueDays;
  final int activeWorkers;
  final int estimatedCompletionDays;
  final List<OverdueFactoryOrder> orders;
  OverdueFactoryGroup({required this.factoryName, this.totalOrders = 0, this.totalQuantity = 0, this.avgProgress = 0, this.avgOverdueDays = 0, this.activeWorkers = 0, this.estimatedCompletionDays = -1, this.orders = const []});
}

class OverdueFactoryCard {
  final int overdueCount;
  final int totalQuantity;
  final int avgProgress;
  final int avgOverdueDays;
  final int factoryGroupCount;
  final List<OverdueFactoryGroup> factoryGroups;
  OverdueFactoryCard({required this.overdueCount, this.totalQuantity = 0, this.avgProgress = 0, this.avgOverdueDays = 0, this.factoryGroupCount = 0, this.factoryGroups = const []});
}

class ReportKpi {
  final String name;
  final dynamic current;
  final dynamic previous;
  final String? unit;
  final String? change;
  ReportKpi({required this.name, this.current, this.previous, this.unit, this.change});
}

class ReportPreview {
  final String reportType;
  final String typeLabel;
  final String rangeLabel;
  final String baseDate;
  final List<ReportKpi> kpis;
  final Map<String, dynamic>? riskSummary;
  final List<Map<String, dynamic>> factoryRanking;
  final Map<String, dynamic>? costSummary;
  ReportPreview({required this.reportType, this.typeLabel = '日报', this.rangeLabel = '', this.baseDate = '', this.kpis = const [], this.riskSummary, this.factoryRanking = const [], this.costSummary});
}

class ChatMessage {
  final String content;
  final bool isUser;
  final DateTime time;
  final List<InsightCard> insightCards;
  final List<String> clarificationHints;
  final List<Map<String, dynamic>> actionCards;
  final OverdueFactoryCard? overdueFactoryCard;
  final ReportPreview? reportPreview;
  ChatMessage({required this.content, required this.isUser, required this.time, this.insightCards = const [], this.clarificationHints = const [], this.actionCards = const [], this.overdueFactoryCard, this.reportPreview});
}

class ParsedAiReply {
  final String displayText;
  final List<InsightCard> insightCards;
  final List<String> clarificationHints;
  final List<Map<String, dynamic>> actionCards;
  final OverdueFactoryCard? overdueFactoryCard;
  final ReportPreview? reportPreview;
  ParsedAiReply({required this.displayText, this.insightCards = const [], this.clarificationHints = const [], this.actionCards = const [], this.overdueFactoryCard, this.reportPreview});
}

OverdueFactoryOrder _parseOverdueOrder(Map<String, dynamic> m) {
  return OverdueFactoryOrder(
    orderNo: m['orderNo']?.toString() ?? '',
    styleNo: m['styleNo']?.toString(),
    progress: m['progress'] is int ? m['progress'] : int.tryParse(m['progress']?.toString() ?? '0') ?? 0,
    overdueDays: m['overdueDays'] is int ? m['overdueDays'] : int.tryParse(m['overdueDays']?.toString() ?? '0') ?? 0,
    quantity: m['quantity'] is int ? m['quantity'] : int.tryParse(m['quantity']?.toString() ?? '0') ?? 0,
    plannedEndDate: m['plannedEndDate']?.toString(),
  );
}

OverdueFactoryGroup _parseOverdueGroup(Map<String, dynamic> m) {
  final ordersRaw = m['orders'] as List? ?? [];
  return OverdueFactoryGroup(
    factoryName: m['factoryName']?.toString() ?? '',
    totalOrders: m['totalOrders'] is int ? m['totalOrders'] : int.tryParse(m['totalOrders']?.toString() ?? '0') ?? 0,
    totalQuantity: m['totalQuantity'] is int ? m['totalQuantity'] : int.tryParse(m['totalQuantity']?.toString() ?? '0') ?? 0,
    avgProgress: m['avgProgress'] is int ? m['avgProgress'] : int.tryParse(m['avgProgress']?.toString() ?? '0') ?? 0,
    avgOverdueDays: m['avgOverdueDays'] is int ? m['avgOverdueDays'] : int.tryParse(m['avgOverdueDays']?.toString() ?? '0') ?? 0,
    activeWorkers: m['activeWorkers'] is int ? m['activeWorkers'] : int.tryParse(m['activeWorkers']?.toString() ?? '0') ?? 0,
    estimatedCompletionDays: m['estimatedCompletionDays'] is int ? m['estimatedCompletionDays'] : int.tryParse(m['estimatedCompletionDays']?.toString() ?? '-1') ?? -1,
    orders: ordersRaw.whereType<Map<String, dynamic>>().map(_parseOverdueOrder).toList(),
  );
}

ParsedAiReply _parseAiReply(String rawText) {
  if (rawText.isEmpty) return ParsedAiReply(displayText: '');

  String text = rawText;
  final insightCards = <InsightCard>[];
  final clarificationHints = <String>[];
  final actionCards = <Map<String, dynamic>>[];
  OverdueFactoryCard? overdueFactoryCard;
  ReportPreview? reportPreview;

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
      } else if (tag == 'OVERDUE_FACTORY') {
        try {
          if (parsed is List) {
            final groups = parsed.whereType<Map<String, dynamic>>().map(_parseOverdueGroup).toList();
            if (groups.isNotEmpty) {
              overdueFactoryCard = OverdueFactoryCard(
                overdueCount: groups.fold(0, (s, g) => s + g.totalOrders),
                totalQuantity: groups.fold(0, (s, g) => s + g.totalQuantity),
                avgProgress: groups.isNotEmpty ? (groups.fold(0, (s, g) => s + g.avgProgress) / groups.length).round() : 0,
                avgOverdueDays: groups.isNotEmpty ? (groups.fold(0, (s, g) => s + g.avgOverdueDays) / groups.length).round() : 0,
                factoryGroupCount: groups.length,
                factoryGroups: groups,
              );
            }
          } else if (parsed is Map && parsed['overdueCount'] != null) {
            final groupsRaw = parsed['factoryGroups'] as List? ?? [];
            overdueFactoryCard = OverdueFactoryCard(
              overdueCount: parsed['overdueCount'] is int ? parsed['overdueCount'] : int.tryParse(parsed['overdueCount'].toString()) ?? 0,
              totalQuantity: parsed['totalQuantity'] is int ? parsed['totalQuantity'] : int.tryParse(parsed['totalQuantity']?.toString() ?? '0') ?? 0,
              avgProgress: parsed['avgProgress'] is int ? parsed['avgProgress'] : int.tryParse(parsed['avgProgress']?.toString() ?? '0') ?? 0,
              avgOverdueDays: parsed['avgOverdueDays'] is int ? parsed['avgOverdueDays'] : int.tryParse(parsed['avgOverdueDays']?.toString() ?? '0') ?? 0,
              factoryGroupCount: parsed['factoryGroupCount'] is int ? parsed['factoryGroupCount'] : int.tryParse(parsed['factoryGroupCount']?.toString() ?? '0') ?? 0,
              factoryGroups: groupsRaw.whereType<Map<String, dynamic>>().map(_parseOverdueGroup).toList(),
            );
          }
        } catch (_) {}
      } else if (tag == 'REPORT_PREVIEW') {
        try {
          if (parsed is Map && parsed['kpis'] != null) {
            final kpisRaw = parsed['kpis'] as List? ?? [];
            reportPreview = ReportPreview(
              reportType: parsed['reportType']?.toString() ?? 'daily',
              typeLabel: parsed['typeLabel']?.toString() ?? '日报',
              rangeLabel: parsed['rangeLabel']?.toString() ?? '',
              baseDate: parsed['baseDate']?.toString() ?? '',
              kpis: kpisRaw.whereType<Map<String, dynamic>>().map((k) => ReportKpi(
                name: k['name']?.toString() ?? '',
                current: k['current'],
                previous: k['previous'],
                unit: k['unit']?.toString(),
                change: k['change']?.toString(),
              )).toList(),
              riskSummary: parsed['riskSummary'] is Map ? Map<String, dynamic>.from(parsed['riskSummary']) : null,
              factoryRanking: (parsed['factoryRanking'] as List?)?.whereType<Map<String, dynamic>>().map(Map<String, dynamic>.from).toList() ?? [],
              costSummary: parsed['costSummary'] is Map ? Map<String, dynamic>.from(parsed['costSummary']) : null,
            );
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  text = text.replaceAll(tagPattern, '');
  text = text.replaceAll(RegExp(r'```ACTIONS_JSON\s*\n[\s\S]*?\n```'), '');
  text = text.trim();

  return ParsedAiReply(displayText: text, insightCards: insightCards, clarificationHints: clarificationHints, actionCards: actionCards, overdueFactoryCard: overdueFactoryCard, reportPreview: reportPreview);
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
          overdueFactoryCard: parsed.overdueFactoryCard,
          reportPreview: parsed.reportPreview,
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
