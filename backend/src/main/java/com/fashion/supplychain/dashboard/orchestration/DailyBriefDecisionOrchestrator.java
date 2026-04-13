package com.fashion.supplychain.dashboard.orchestration;

import com.fashion.supplychain.dashboard.dto.BriefDecisionCard;
import com.fashion.supplychain.production.entity.ProductionOrder;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 日报判断卡编排器
 * 将统计数字转成可直接展示在现有悬停卡/建议区的结构化判断。
 */
@Service
public class DailyBriefDecisionOrchestrator {

    public List<BriefDecisionCard> buildDecisionCards(
            LocalDate today,
            long overdueCount,
            long todayScanCount,
            long yesterdayWarehousingCount,
            long yesterdayWarehousingQuantity,
            List<ProductionOrder> highRiskOrders,
            List<ProductionOrder> overdueOrders) {
        List<BriefDecisionCard> cards = new ArrayList<>();
        if (overdueCount > 0) {
            cards.add(buildOverdueCard(today, overdueCount, overdueOrders));
        }
        if (!highRiskOrders.isEmpty()) {
            cards.add(buildHighRiskCard(today, highRiskOrders.get(0), highRiskOrders.size()));
        }
        if (todayScanCount == 0) {
            cards.add(buildScanGapCard(yesterdayWarehousingCount, yesterdayWarehousingQuantity));
        } else if (yesterdayWarehousingCount > 0 || yesterdayWarehousingQuantity > 0) {
            cards.add(buildWarehousingCard(todayScanCount, yesterdayWarehousingCount, yesterdayWarehousingQuantity));
        }
        if (cards.isEmpty()) {
            cards.add(buildHealthyCard(todayScanCount, yesterdayWarehousingCount, yesterdayWarehousingQuantity));
        }
        return cards.stream().limit(3).collect(Collectors.toList());
    }

    /**
     * 逾期卡：工厂分组展示件数/逾期天数/跟单员
     */
    private BriefDecisionCard buildOverdueCard(LocalDate today, long overdueCount,
            List<ProductionOrder> overdueOrders) {
        List<String> evidence = new ArrayList<>();

        if (overdueOrders.isEmpty()) {
            // 兜底：没有详细数据时仅显示计数
            evidence.add("共 " + overdueCount + " 张订单超交期");
        } else {
            // 按工厂分组，取件数最多的前 5 家
            Map<String, List<ProductionOrder>> byFactory = overdueOrders.stream()
                .collect(Collectors.groupingBy(o ->
                    (o.getFactoryName() != null && !o.getFactoryName().isBlank())
                        ? o.getFactoryName() : "未填工厂"));

            byFactory.entrySet().stream()
                .sorted(Comparator.<Map.Entry<String, List<ProductionOrder>>>comparingInt(
                    e -> e.getValue().stream().mapToInt(o ->
                        o.getOrderQuantity() == null ? 0 : o.getOrderQuantity()).sum()).reversed())
                .limit(5)
                .forEach(entry -> {
                    String fName = entry.getKey();
                    List<ProductionOrder> fOrders = entry.getValue();
                    int fQty = fOrders.stream()
                        .mapToInt(o -> o.getOrderQuantity() == null ? 0 : o.getOrderQuantity()).sum();
                    long maxOverdue = fOrders.stream()
                        .filter(o -> o.getPlannedEndDate() != null)
                        .mapToLong(o -> ChronoUnit.DAYS.between(
                            o.getPlannedEndDate().toLocalDate(), today))
                        .max().orElse(0);
                    String merch = fOrders.stream()
                        .map(ProductionOrder::getMerchandiser)
                        .filter(m -> m != null && !m.isBlank())
                        .distinct().limit(2).collect(Collectors.joining("/"));
                    StringBuilder sb = new StringBuilder();
                    sb.append(fName).append(": ").append(fOrders.size()).append("单");
                    if (fQty > 0) sb.append("/").append(fQty).append("件");
                    sb.append(" · 逾期最长").append(maxOverdue).append("天");
                    if (!merch.isBlank()) sb.append(" · 跟单: ").append(merch);
                    evidence.add(sb.toString());
                });
        }

        // 合计件数用于标题
        int totalQty = overdueOrders.stream()
            .mapToInt(o -> o.getOrderQuantity() == null ? 0 : o.getOrderQuantity()).sum();
        long factoryCount = overdueOrders.stream()
            .map(o -> o.getFactoryName() != null ? o.getFactoryName() : "")
            .filter(n -> !n.isBlank()).distinct().count();
        String titleQtySuffix = totalQty > 0 ? " / " + totalQty + "件" : "";
        String summary = overdueCount + " 张订单已超交期"
            + (factoryCount > 0 ? "，波及 " + factoryCount + " 家工厂" : "")
            + "，需逐单确认。";

        return buildCard(
            "danger",
            "逾期 " + overdueCount + " 单" + titleQtySuffix + " 待处理",
            summary,
            "违约风险",
            "高置信",
            "规则判断",
            evidence,
            "逐单确认卡点，决定补产或升级",
            "查看逾期清单",
            "/production/progress-detail?filter=overdue");
    }

    private BriefDecisionCard buildHighRiskCard(LocalDate today, ProductionOrder top, int highRiskCount) {
        long daysLeft = ChronoUnit.DAYS.between(today, top.getPlannedEndDate().toLocalDate());
        Integer progress = top.getProductionProgress() == null ? 0 : top.getProductionProgress();
        Integer qty = top.getOrderQuantity();
        List<String> evidence = new ArrayList<>(Arrays.asList(
                "高风险 " + highRiskCount + " 张",
                formatOrderEvidence(top, daysLeft)
        ));
        if (qty != null && qty > 0) {
            int gap = (100 - progress) * qty / 100;
            evidence.add("共 " + qty + " 件 · 进度 " + progress + "% · 预估缺口约 " + gap + " 件");
        } else {
            evidence.add("进度 " + progress + "%");
        }
        String merch = top.getMerchandiser();
        if (merch != null && !merch.isBlank()) {
            evidence.add("跟单员: " + merch);
        }
        return buildCard(
            daysLeft <= 3 ? "danger" : "warning",
            "先催 " + safe(top.getOrderNo()),
            safe(top.getFactoryName()) + "·剩" + daysLeft + "天·进度" + progress + "%，需优先跟进。",
            "交期近+进度低",
            daysLeft <= 3 ? "高置信" : "中高置信",
            "规则判断",
            evidence,
            "确认卡点，加人/加班/拆单",
            "打开订单跟进",
            "/production/progress-detail?orderNo=" + safe(top.getOrderNo()));
    }

    private BriefDecisionCard buildScanGapCard(long yesterdayWarehousingCount, long yesterdayWarehousingQuantity) {
        return buildCard(
            "warning",
            "今日0扫码",
            "今日无扫码记录，需确认现场状况。",
            "进度数据断档",
            "中置信",
            "规则判断",
            Arrays.asList(
                "今日扫码 0 次",
                "昨日入库 " + yesterdayWarehousingCount + " 单 / " + yesterdayWarehousingQuantity + " 件"
            ),
            "核实是否停工或漏录",
            "查看工序跟进",
            "/production/progress-detail");
    }

    private BriefDecisionCard buildWarehousingCard(long todayScanCount, long yesterdayWarehousingCount, long yesterdayWarehousingQuantity) {
        return buildCard(
            "info",
            "节奏正常",
            "今日" + todayScanCount + "次扫码，昨日入库" + yesterdayWarehousingCount + "单/" + yesterdayWarehousingQuantity + "件。",
            "聚焦风险单",
            "中置信",
            "规则判断",
            Arrays.asList(
                "今日扫码 " + todayScanCount + " 次",
                "昨日入库 " + yesterdayWarehousingCount + " 单 / " + yesterdayWarehousingQuantity + " 件"
            ),
            "重点跟进高风险与停滞单",
            "查看今日看板",
            "/dashboard");
    }

    private BriefDecisionCard buildHealthyCard(long todayScanCount, long yesterdayWarehousingCount, long yesterdayWarehousingQuantity) {
        return buildCard(
            "success",
            "运转正常",
            "无逾期/高风险，扫码" + todayScanCount + "次，入库" + yesterdayWarehousingCount + "单。",
            "保持节奏",
            "中置信",
            "规则判断",
            Arrays.asList(
                "今日扫码 " + todayScanCount + " 次",
                "昨日入库 " + yesterdayWarehousingCount + " 单 / " + yesterdayWarehousingQuantity + " 件"
            ),
            "例行抽查关键订单",
            "查看运营日报",
            "/dashboard");
    }

        private BriefDecisionCard buildCard(
            String level,
            String title,
            String summary,
            String painPoint,
            String confidence,
            String source,
            List<String> evidence,
            String execute,
            String actionLabel,
            String actionPath) {
        BriefDecisionCard card = new BriefDecisionCard();
        card.setLevel(level);
        card.setTitle(title);
        card.setSummary(summary);
        card.setPainPoint(painPoint);
        card.setConfidence(confidence);
        card.setSource(source);
        card.setEvidence(evidence);
        card.setExecute(execute);
        card.setActionLabel(actionLabel);
        card.setActionPath(actionPath);
        return card;
        }

    private String formatOrderEvidence(ProductionOrder order, long daysLeft) {
        return safe(order.getOrderNo()) + " · " + safe(order.getFactoryName())
                + " · " + (daysLeft < 0 ? "已逾期 " + Math.abs(daysLeft) + " 天" : "剩余 " + daysLeft + " 天")
                + " · 进度 " + (order.getProductionProgress() == null ? 0 : order.getProductionProgress()) + "%";
    }

    private String safe(String value) {
        return value == null || value.isBlank() ? "未填" : value;
    }
}
