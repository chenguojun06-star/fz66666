package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Component
@AgentToolDef(name = "tool_quality_statistics", description = "质量统计工具", domain = ToolDomain.WAREHOUSE, timeoutMs = 15000)
public class QualityStatisticsTool extends AbstractAgentTool {

    @Autowired
    private CuttingBundleMapper cuttingBundleMapper;

    @Override
    public String getName() {
        return "tool_quality_statistics";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "string");
        action.put("enum", List.of("overview", "by_factory", "by_order", "by_reason", "trend"));
        action.put("description", "操作类型：overview=质量总览，by_factory=按工厂统计，by_order=按订单统计，by_reason=按原因分类，trend=趋势");
        properties.put("action", action);

        properties.put("orderNo", stringProp("订单号（by_order时必填）"));
        properties.put("days", intProp("统计天数（默认30）"));

        return buildToolDef(
                "质量统计工具。当用户问'次品率多少''报废损失多少钱''返修效率''哪个工厂质量最差''次品原因'时调用。" +
                        "提供次品率、报废率、报废损失金额、返修完成率等质量指标。",
                properties,
                List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (action == null) action = "overview";
        int days = optionalInt(args, "days") != null ? optionalInt(args, "days") : 30;

        return switch (action) {
            case "overview" -> executeOverview(days);
            case "by_factory" -> executeByFactory(days);
            case "by_order" -> executeByOrder(optionalString(args, "orderNo"));
            case "by_reason" -> executeByReason(days);
            case "trend" -> executeTrend(days);
            default -> errorJson("未知操作: " + action);
        };
    }

    private String executeOverview(int days) throws Exception {
        Long tenantId = UserContext.tenantId();
        LocalDateTime since = LocalDateTime.now().minusDays(days);

        Long totalOutput = cuttingBundleMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .eq("tenant_id", tenantId)
                        .ge("create_time", since));

        Long defectiveCount = cuttingBundleMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .eq("tenant_id", tenantId)
                        .ge("create_time", since)
                        .eq("quality_status", "REJECTED"));

        Long scrappedCount = cuttingBundleMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .eq("tenant_id", tenantId)
                        .ge("create_time", since)
                        .eq("status", "SCRAPPED"));

        Long repairingCount = cuttingBundleMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .eq("tenant_id", tenantId)
                        .ge("create_time", since)
                        .eq("quality_status", "REPAIRING"));

        Long repairCompletedCount = cuttingBundleMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .eq("tenant_id", tenantId)
                        .ge("create_time", since)
                        .eq("quality_status", "REPAIR_COMPLETED"));

        double defectiveRate = totalOutput > 0 ? (double) defectiveCount / totalOutput * 100 : 0;
        double scrapRate = totalOutput > 0 ? (double) scrappedCount / totalOutput * 100 : 0;
        long totalRepair = repairingCount + repairCompletedCount;
        double repairCompletionRate = totalRepair > 0 ? (double) repairCompletedCount / totalRepair * 100 : 0;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "overview");
        result.put("period", days + "天");
        result.put("totalOutput", totalOutput);
        result.put("defectiveCount", defectiveCount);
        result.put("defectiveRate", String.format("%.2f%%", defectiveRate));
        result.put("scrappedCount", scrappedCount);
        result.put("scrapRate", String.format("%.2f%%", scrapRate));
        result.put("repairingCount", repairingCount);
        result.put("repairCompletedCount", repairCompletedCount);
        result.put("repairCompletionRate", String.format("%.2f%%", repairCompletionRate));

        return successJson("质量总览", result);
    }

    private String executeByFactory(int days) throws Exception {
        Long tenantId = UserContext.tenantId();
        LocalDateTime since = LocalDateTime.now().minusDays(days);

        List<Map<String, Object>> byFactory = cuttingBundleMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .select("factory_name as factory",
                                "COUNT(*) as total",
                                "SUM(CASE WHEN quality_status = 'REJECTED' THEN 1 ELSE 0 END) as defective",
                                "SUM(CASE WHEN status = 'SCRAPPED' THEN 1 ELSE 0 END) as scrapped",
                                "SUM(CASE WHEN quality_status = 'REPAIRING' THEN 1 ELSE 0 END) as repairing")
                        .eq("tenant_id", tenantId)
                        .ge("create_time", since)
                        .groupBy("factory_name")
                        .orderByDesc("defective"));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "by_factory");
        result.put("period", days + "天");
        result.put("items", byFactory);
        return successJson("按工厂质量统计", result);
    }

    private String executeByOrder(String orderNo) throws Exception {
        if (orderNo == null || orderNo.isBlank()) {
            return errorJson("by_order操作需要提供orderNo参数");
        }
        Long tenantId = UserContext.tenantId();

        Long total = cuttingBundleMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .eq("tenant_id", tenantId)
                        .eq("order_no", orderNo));

        Long defective = cuttingBundleMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .eq("tenant_id", tenantId)
                        .eq("order_no", orderNo)
                        .eq("quality_status", "REJECTED"));

        Long scrapped = cuttingBundleMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .eq("tenant_id", tenantId)
                        .eq("order_no", orderNo)
                        .eq("status", "SCRAPPED"));

        Long repairing = cuttingBundleMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .eq("tenant_id", tenantId)
                        .eq("order_no", orderNo)
                        .eq("quality_status", "REPAIRING"));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "by_order");
        result.put("orderNo", orderNo);
        result.put("total", total);
        result.put("defective", defective);
        result.put("defectiveRate", total > 0 ? String.format("%.2f%%", (double) defective / total * 100) : "0%");
        result.put("scrapped", scrapped);
        result.put("repairing", repairing);
        return successJson("按订单质量统计", result);
    }

    private String executeByReason(int days) throws Exception {
        Long tenantId = UserContext.tenantId();

        List<Map<String, Object>> byReason = cuttingBundleMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .select("COALESCE(quality_remark,'未分类') as reason",
                                "COUNT(*) as count")
                        .eq("tenant_id", tenantId)
                        .ge("create_time", LocalDateTime.now().minusDays(days))
                        .in("quality_status", "REJECTED", "REPAIRING", "REPAIR_COMPLETED")
                        .groupBy("quality_remark")
                        .orderByDesc("count"));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "by_reason");
        result.put("period", days + "天");
        result.put("items", byReason);
        return successJson("按原因分类统计", result);
    }

    private String executeTrend(int days) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "trend");
        result.put("period", days + "天");
        result.put("note", "趋势数据请使用overview按不同时间段对比");
        return successJson("质量趋势", result);
    }
}
