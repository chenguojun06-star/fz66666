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
        String summary = "当前已有 " + overdueCount + " 张订单超过交期，优先级必须高于常规跟单。";
        List<String> evidence = new ArrayList<>();
        evidence.add("逾期订单 " + overdueCount + " 张");
        if (!highRiskOrders.isEmpty()) {
            ProductionOrder top = highRiskOrders.get(0);
            long daysLeft = ChronoUnit.DAYS.between(today, top.getPlannedEndDate().toLocalDate());
            evidence.add(formatOrderEvidence(top, daysLeft));
        }
        evidence.add("来源：交期 + 当前生产进度规则判断");
        return buildCard(
            "danger",
            "先处理逾期订单",
            summary,
            "交期已经越线，再按常规节奏跟单只会继续放大违约风险。",
            "高置信",
            "规则判断",
            evidence,
            "先拉逾期清单逐单确认：谁卡住、能否补产、是否需要升级处理。",
            "查看逾期清单",
            "/production/progress-detail");
    }

    private BriefDecisionCard buildHighRiskCard(LocalDate today, ProductionOrder top, int highRiskCount) {
        long daysLeft = ChronoUnit.DAYS.between(today, top.getPlannedEndDate().toLocalDate());
        Integer progress = top.getProductionProgress() == null ? 0 : top.getProductionProgress();
        List<String> evidence = Arrays.asList(
                "高风险订单 " + highRiskCount + " 张",
                formatOrderEvidence(top, daysLeft),
                "当前进度 " + progress + "% ，低于交付安全线"
        );
        return buildCard(
            daysLeft <= 3 ? "danger" : "warning",
            "今天先催 " + safe(top.getOrderNo()),
            safe(top.getFactoryName()) + " 的这张单离交期很近，但当前进度仍偏低，今天应该先盯这一单。",
            "离交期近但进度没跟上，最容易在最后几天集中爆雷。",
            daysLeft <= 3 ? "高置信" : "中高置信",
            "规则判断",
            evidence,
            "先找工厂确认卡在哪一道，再决定是加人、加班还是拆单分流。",
            "打开订单跟进",
            "/production?orderNo=" + safe(top.getOrderNo()));
    }

    private BriefDecisionCard buildScanGapCard(long yesterdayWarehousingCount, long yesterdayWarehousingQuantity) {
        return buildCard(
            "warning",
            "先确认扫码录入",
            "今天还没有新的扫码记录，现场可能没录，也可能节奏真的慢下来了。",
            "一旦现场没录进度，管理层看到的就是假平静。",
            "中置信",
            "规则判断",
            Arrays.asList(
                "今日扫码 0 次",
                "昨日入库 " + yesterdayWarehousingCount + " 单 / " + yesterdayWarehousingQuantity + " 件",
                "来源：扫码流水与入库对比"
            ),
            "先核实是没人扫、没开工，还是数据没回传，再决定是否催工厂。",
            "查看生产进度",
            "/production/progress-detail");
    }

    private BriefDecisionCard buildWarehousingCard(long todayScanCount, long yesterdayWarehousingCount, long yesterdayWarehousingQuantity) {
        return buildCard(
            "info",
            "保持当前推进节奏",
            "今日已有稳定扫码，昨日也有入库，当前更适合盯紧风险单，不必全量打扰工厂。",
            "如果全线同时催办，反而会冲淡真正该优先处理的异常单。",
            "中置信",
            "规则判断",
            Arrays.asList(
                "今日扫码 " + todayScanCount + " 次",
                "昨日入库 " + yesterdayWarehousingCount + " 单 / " + yesterdayWarehousingQuantity + " 件",
                "来源：近两日现场活跃度"
            ),
            "把注意力放到高风险与停滞单，不要平均用力。",
            "查看今日看板",
            "/dashboard");
    }

    private BriefDecisionCard buildHealthyCard(long todayScanCount, long yesterdayWarehousingCount, long yesterdayWarehousingQuantity) {
        return buildCard(
            "success",
            "整体状态平稳",
            "当前没有明显交付风险，今天按既定节奏推进即可。",
            "风险不高时，最怕的是因为误判而频繁打断正常节奏。",
            "中置信",
            "规则判断",
            Arrays.asList(
                "今日扫码 " + todayScanCount + " 次",
                "昨日入库 " + yesterdayWarehousingCount + " 单 / " + yesterdayWarehousingQuantity + " 件",
                "暂无逾期与高风险告警"
            ),
            "保持例行抽查，重点盯住关键订单，不需要全线加压。",
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
