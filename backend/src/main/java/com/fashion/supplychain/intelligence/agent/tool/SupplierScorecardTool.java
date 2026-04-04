package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.SupplierScorecardResponse;
import com.fashion.supplychain.intelligence.orchestration.SupplierScorecardOrchestrator;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 供应商/工厂综合评分卡 AI 工具
 *
 * <p>基于近3个月订单数据，从准时率（40%）、质量分（40%）、完成率（20%）三维评分。
 * <p>评级：S（≥90）/ A（≥75）/ B（≥60）/ C（<60）
 */
@Slf4j
@Component
public class SupplierScorecardTool extends AbstractAgentTool {

    @Autowired
    private SupplierScorecardOrchestrator supplierScorecardOrchestrator;

    @Override
    public String getName() {
        return "tool_supplier_scorecard";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("action", stringProp("操作类型：scorecard（综合评分卡）/ top（优质工厂榜单）/ risk（低分风险工厂）"));
        props.put("tier_filter", stringProp("评级筛选：S/A/B/C，为空时返回全部"));
        props.put("top_n", intProp("返回前N家，默认5，最大20（top/risk action有效）"));
        return buildToolDef("供应商/工厂综合评分卡：基于准时率、质量分、完成率三维评估近3个月合作工厂表现",
                props, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");
        return switch (action) {
            case "scorecard" -> fullScorecard(args);
            case "top" -> topFactories(args);
            case "risk" -> riskFactories(args);
            default -> errorJson("不支持的action: " + action + "，可选: scorecard/top/risk");
        };
    }

    private String fullScorecard(Map<String, Object> args) {
        try {
            String tierFilter = optionalString(args, "tier_filter");
            SupplierScorecardResponse resp = supplierScorecardOrchestrator.scorecard();

            List<Map<String, Object>> rows = new ArrayList<>();
            for (SupplierScorecardResponse.SupplierScore s : resp.getScores()) {
                if (tierFilter != null && !tierFilter.equalsIgnoreCase(s.getTier())) continue;
                rows.add(toMap(s));
            }
            return successJson(resp.getSummary(), Map.of(
                    "factories", rows,
                    "topCount", resp.getTopCount(),
                    "totalEvaluated", rows.size()
            ));
        } catch (Exception e) {
            log.error("[SupplierScorecardTool.scorecard] 异常: {}", e.getMessage(), e);
            return errorJson("供应商评分卡查询失败: " + e.getMessage());
        }
    }

    private String topFactories(Map<String, Object> args) {
        try {
            Integer topNRaw = optionalInt(args, "top_n");
            int topN = Math.min(topNRaw != null ? topNRaw : 5, 20);
            SupplierScorecardResponse resp = supplierScorecardOrchestrator.scorecard();

            List<Map<String, Object>> top = new ArrayList<>();
            for (SupplierScorecardResponse.SupplierScore s : resp.getScores()) {
                if (top.size() >= topN) break;
                if ("S".equals(s.getTier()) || "A".equals(s.getTier())) top.add(toMap(s));
            }
            return successJson("优质工厂榜单（Top" + topN + "）", Map.of("topFactories", top));
        } catch (Exception e) {
            log.error("[SupplierScorecardTool.top] 异常: {}", e.getMessage(), e);
            return errorJson("优质工厂榜单查询失败: " + e.getMessage());
        }
    }

    private String riskFactories(Map<String, Object> args) {
        try {
            Integer topNRaw = optionalInt(args, "top_n");
            int topN = Math.min(topNRaw != null ? topNRaw : 5, 20);
            SupplierScorecardResponse resp = supplierScorecardOrchestrator.scorecard();

            // 逆序取评分最低的几家
            List<SupplierScorecardResponse.SupplierScore> all = resp.getScores();
            List<Map<String, Object>> risk = new ArrayList<>();
            for (int i = all.size() - 1; i >= 0 && risk.size() < topN; i--) {
                SupplierScorecardResponse.SupplierScore s = all.get(i);
                if ("B".equals(s.getTier()) || "C".equals(s.getTier())) risk.add(toMap(s));
            }
            String summary = risk.isEmpty()
                    ? "当前没有低分（B/C级）工厂，整体合作质量良好"
                    : "共发现 " + risk.size() + " 家需关注的低分工厂";
            return successJson(summary, Map.of("riskFactories", risk));
        } catch (Exception e) {
            log.error("[SupplierScorecardTool.risk] 异常: {}", e.getMessage(), e);
            return errorJson("风险工厂查询失败: " + e.getMessage());
        }
    }

    private Map<String, Object> toMap(SupplierScorecardResponse.SupplierScore s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("factoryName", s.getFactoryName());
        m.put("tier", s.getTier());
        m.put("overallScore", s.getOverallScore());
        m.put("onTimeRate", s.getOnTimeRate());
        m.put("qualityScore", s.getQualityScore());
        m.put("totalOrders", s.getTotalOrders());
        m.put("completedOrders", s.getCompletedOrders());
        m.put("overdueOrders", s.getOverdueOrders());
        return m;
    }
}
