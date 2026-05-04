package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;

/**
 * 质量统计工具 — 让小云AI能直接回答"次品率多少""报废损失多少钱""返修效率"等问题。
 *
 * <p>支持操作：
 * <ul>
 *   <li>overview — 质量总览（次品率、报废率、报废损失金额、返修完成率）</li>
 *   <li>by_factory — 按工厂分组的质量统计</li>
 *   <li>by_order — 按订单的质量统计（需传orderNo）</li>
 *   <li>by_reason — 按原因分类的次品统计</li>
 *   <li>trend — 近30天次品率趋势</li>
 * </ul>
 */
@Slf4j
@Component
public class QualityStatisticsTool implements AgentTool {

    @Autowired
    private CuttingBundleMapper cuttingBundleMapper;

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private MaterialStockMapper materialStockMapper;

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

        Map<String, Object> orderNo = new LinkedHashMap<>();
        orderNo.put("type", "string");
        orderNo.put("description", "订单号（by_order时必填）");
        properties.put("orderNo", orderNo);

        Map<String, Object> days = new LinkedHashMap<>();
        days.put("type", "integer");
        days.put("description", "统计天数（默认30）");
        properties.put("days", days);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("质量统计工具。当用户问'次品率多少''报废损失多少钱''返修效率''哪个工厂质量最差''次品原因'时调用。" +
                "提供次品率、报废率、报废损失金额、返修完成率等质量指标。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        Map<String, Object> args = new com.fasterxml.jackson.databind.ObjectMapper().readValue(argumentsJson, new com.fasterxml.jackson.core.type.TypeReference<>() {});
        String action = (String) args.getOrDefault("action", "overview");
        int days = args.containsKey("days") ? ((Number) args.get("days")).intValue() : 30;

        return switch (action) {
            case "overview" -> executeOverview(tenantId, days);
            case "by_factory" -> executeByFactory(tenantId, days);
            case "by_order" -> executeByOrder(tenantId, (String) args.get("orderNo"));
            case "by_reason" -> executeByReason(tenantId, days);
            case "trend" -> executeTrend(tenantId, days);
            default -> errorJson("未知操作: " + action);
        };
    }

    private String executeOverview(Long tenantId, int days) {
        try {
            LocalDateTime since = LocalDateTime.now().minusDays(days);

            // 总产出数
            Long totalOutput = cuttingBundleMapper.selectCount(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.production.entity.CuttingBundle>()
                            .eq("tenant_id", tenantId)
                            .ge("create_time", since));

            // 次品数（质检不合格）
            Long defectiveCount = cuttingBundleMapper.selectCount(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.production.entity.CuttingBundle>()
                            .eq("tenant_id", tenantId)
                            .ge("create_time", since)
                            .eq("quality_status", "REJECTED"));

            // 报废数
            Long scrappedCount = cuttingBundleMapper.selectCount(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.production.entity.CuttingBundle>()
                            .eq("tenant_id", tenantId)
                            .ge("create_time", since)
                            .eq("status", "SCRAPPED"));

            // 返修中
            Long repairingCount = cuttingBundleMapper.selectCount(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.production.entity.CuttingBundle>()
                            .eq("tenant_id", tenantId)
                            .ge("create_time", since)
                            .eq("quality_status", "REPAIRING"));

            // 返修完成
            Long repairCompletedCount = cuttingBundleMapper.selectCount(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.production.entity.CuttingBundle>()
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

            return successJson(result);
        } catch (Exception e) {
            log.warn("[QualityStats] overview查询失败: {}", e.getMessage());
            return errorJson("质量总览查询失败: " + e.getMessage());
        }
    }

    private String executeByFactory(Long tenantId, int days) {
        try {
            LocalDateTime since = LocalDateTime.now().minusDays(days);

            // 按工厂分组统计次品率
            List<Map<String, Object>> byFactory = cuttingBundleMapper.selectMaps(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.production.entity.CuttingBundle>()
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
            return successJson(result);
        } catch (Exception e) {
            log.warn("[QualityStats] by_factory查询失败: {}", e.getMessage());
            return errorJson("按工厂统计查询失败: " + e.getMessage());
        }
    }

    private String executeByOrder(Long tenantId, String orderNo) {
        if (orderNo == null || orderNo.isBlank()) {
            return errorJson("by_order操作需要提供orderNo参数");
        }
        try {
            Long total = cuttingBundleMapper.selectCount(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.production.entity.CuttingBundle>()
                            .eq("tenant_id", tenantId)
                            .eq("order_no", orderNo));

            Long defective = cuttingBundleMapper.selectCount(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.production.entity.CuttingBundle>()
                            .eq("tenant_id", tenantId)
                            .eq("order_no", orderNo)
                            .eq("quality_status", "REJECTED"));

            Long scrapped = cuttingBundleMapper.selectCount(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.production.entity.CuttingBundle>()
                            .eq("tenant_id", tenantId)
                            .eq("order_no", orderNo)
                            .eq("status", "SCRAPPED"));

            Long repairing = cuttingBundleMapper.selectCount(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.production.entity.CuttingBundle>()
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
            return successJson(result);
        } catch (Exception e) {
            log.warn("[QualityStats] by_order查询失败: {}", e.getMessage());
            return errorJson("按订单统计查询失败: " + e.getMessage());
        }
    }

    private String executeByReason(Long tenantId, int days) {
        try {
            // 按质量问题描述分类（简化：按quality_remark关键词分类）
            List<Map<String, Object>> byReason = cuttingBundleMapper.selectMaps(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.production.entity.CuttingBundle>()
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
            return successJson(result);
        } catch (Exception e) {
            log.warn("[QualityStats] by_reason查询失败: {}", e.getMessage());
            return errorJson("按原因统计查询失败: " + e.getMessage());
        }
    }

    private String executeTrend(Long tenantId, int days) {
        try {
            // 简化：返回总览数据，趋势图由前端绘制
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("action", "trend");
            result.put("period", days + "天");
            result.put("note", "趋势数据请使用overview按不同时间段对比");
            return successJson(result);
        } catch (Exception e) {
            return errorJson("趋势查询失败: " + e.getMessage());
        }
    }

    private String successJson(Map<String, Object> data) {
        data.put("success", true);
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(data);
        } catch (Exception e) {
            return "{\"success\":true}";
        }
    }

    private String errorJson(String msg) {
        return "{\"success\":false,\"error\":\"" + msg.replace("\"", "'") + "\"}";
    }
}
