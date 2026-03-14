package com.fashion.supplychain.dashboard.orchestration;

import com.fashion.supplychain.dashboard.dto.BriefDecisionCard;
import com.fashion.supplychain.production.entity.ProductionOrder;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
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
            List<ProductionOrder> highRiskOrders) {
        List<BriefDecisionCard> cards = new ArrayList<>();
        if (overdueCount > 0) {
            cards.add(buildOverdueCard(today, overdueCount, highRiskOrders));
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

    private BriefDecisionCard buildOverdueCard(LocalDate today, long overdueCount, List<ProductionOrder> highRiskOrders) {
        List<String> evidence = new ArrayList<>();
        evidence.add("逾期 " + overdueCount + " 张");
        if (!highRiskOrders.isEmpty()) {
            ProductionOrder top = highRiskOrders.get(0);
            long daysLeft = ChronoUnit.DAYS.between(today, top.getPlannedEndDate().toLocalDate());
            evidence.add(formatOrderEvidence(top, daysLeft));
        }
        return buildCard(
            "danger",
            "逾期 " + overdueCount + " 单待处理",
            overdueCount + " 张订单已超交期，需逐单确认。",
            "违约风险",
            "高置信",
            "规则判断",
            evidence,
            "逐单确认卡点，决定补产或升级",
            "查看逾期清单",
            "/production/progress-detail");
    }

    private BriefDecisionCard buildHighRiskCard(LocalDate today, ProductionOrder top, int highRiskCount) {
        long daysLeft = ChronoUnit.DAYS.between(today, top.getPlannedEndDate().toLocalDate());
        Integer progress = top.getProductionProgress() == null ? 0 : top.getProductionProgress();
        List<String> evidence = Arrays.asList(
                "高风险 " + highRiskCount + " 张",
                formatOrderEvidence(top, daysLeft),
                "进度 " + progress + "%"
        );
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
            "/production?orderNo=" + safe(top.getOrderNo()));
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
            "查看生产进度",
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
