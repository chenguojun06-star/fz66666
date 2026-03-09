package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.production.service.MaterialStockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;

/**
 * 系统全局概览统计工具 — 提供聚合数据帮助AI回答"系统有什么/状态/进度/卡点"
 */
@Slf4j
@Component
public class SystemOverviewTool implements AgentTool {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private MaterialStockService materialStockService;

    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_system_overview";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> scopeProp = new HashMap<>();
        scopeProp.put("type", "string");
        scopeProp.put("description", "查询范围：all(全局统计), production(生产概览), risk(风险卡点), today(今日动态)");
        properties.put("scope", scopeProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("获取系统全局概览统计数据。包括：订单总数/各状态数量、今日扫码量、逾期订单、高风险订单、库存概况等聚合信息。当用户询问'系统状态'、'整体概况'、'有什么卡点'、'进度怎么样'时优先调用此工具。");
        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        function.setParameters(aiParams);
        tool.setFunction(function);

        return tool;
    }

    @Override
    public String execute(String argumentsJson) {
        log.info("Tool: {} called with args: {}", getName(), argumentsJson);
        try {
            Long tenantId = UserContext.tenantId();
            Map<String, Object> overview = new LinkedHashMap<>();

            // --- 生产订单统计 ---
            overview.put("production", buildProductionStats(tenantId));

            // --- 风险与卡点 ---
            overview.put("risk", buildRiskStats(tenantId));

            // --- 今日动态 ---
            overview.put("today", buildTodayStats(tenantId));

            // --- 库存概况 ---
            overview.put("stock", buildStockStats(tenantId));

            return objectMapper.writeValueAsString(overview);
        } catch (Exception e) {
            log.error("SystemOverviewTool execution failed", e);
            return "{\"error\": \"系统概览查询失败: " + e.getMessage() + "\"}";
        }
    }

    private Map<String, Object> buildProductionStats(Long tenantId) {
        Map<String, Object> stats = new LinkedHashMap<>();

        QueryWrapper<ProductionOrder> baseQuery = new QueryWrapper<>();
        baseQuery.eq("delete_flag", 0);
        if (tenantId != null) baseQuery.eq("tenant_id", tenantId);
        long totalOrders = productionOrderService.count(baseQuery);

        // 各状态统计
        String[] statuses = {"PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"};
        Map<String, Long> statusCounts = new LinkedHashMap<>();
        for (String s : statuses) {
            QueryWrapper<ProductionOrder> q = new QueryWrapper<>();
            q.eq("delete_flag", 0).eq("status", s);
            if (tenantId != null) q.eq("tenant_id", tenantId);
            statusCounts.put(s, productionOrderService.count(q));
        }

        stats.put("totalOrders", totalOrders);
        stats.put("statusBreakdown", statusCounts);

        // 平均进度（进行中订单）
        QueryWrapper<ProductionOrder> inProgressQuery = new QueryWrapper<>();
        inProgressQuery.eq("delete_flag", 0).eq("status", "IN_PROGRESS");
        if (tenantId != null) inProgressQuery.eq("tenant_id", tenantId);
        List<ProductionOrder> inProgressOrders = productionOrderService.list(inProgressQuery);
        if (!inProgressOrders.isEmpty()) {
            double avgProgress = inProgressOrders.stream()
                    .mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0)
                    .average().orElse(0);
            stats.put("avgProgressPercent", Math.round(avgProgress));
            stats.put("inProgressCount", inProgressOrders.size());
        }

        return stats;
    }

    private Map<String, Object> buildRiskStats(Long tenantId) {
        Map<String, Object> risk = new LinkedHashMap<>();

        // 逾期订单（planned_end_date < now 且未完成）
        QueryWrapper<ProductionOrder> overdueQuery = new QueryWrapper<>();
        overdueQuery.eq("delete_flag", 0)
                .ne("status", "COMPLETED").ne("status", "CANCELLED")
                .isNotNull("planned_end_date")
                .lt("planned_end_date", LocalDateTime.now());
        if (tenantId != null) overdueQuery.eq("tenant_id", tenantId);
        List<ProductionOrder> overdueOrders = productionOrderService.list(overdueQuery);
        risk.put("overdueCount", overdueOrders.size());

        // 展示前5个逾期订单
        List<Map<String, Object>> overdueList = new ArrayList<>();
        int limit = Math.min(overdueOrders.size(), 5);
        for (int i = 0; i < limit; i++) {
            ProductionOrder o = overdueOrders.get(i);
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("orderNo", o.getOrderNo());
            dto.put("styleName", o.getStyleName());
            dto.put("factoryName", o.getFactoryName());
            dto.put("progress", (o.getProductionProgress() != null ? o.getProductionProgress() : 0) + "%");
            dto.put("deadline", o.getPlannedEndDate() != null ? o.getPlannedEndDate().toLocalDate().toString() : "未设置");
            overdueList.add(dto);
        }
        risk.put("overdueOrders", overdueList);

        // 高风险订单（7天内到期且进度<50%）
        LocalDateTime sevenDaysLater = LocalDateTime.now().plusDays(7);
        QueryWrapper<ProductionOrder> highRiskQuery = new QueryWrapper<>();
        highRiskQuery.eq("delete_flag", 0)
                .eq("status", "IN_PROGRESS")
                .isNotNull("planned_end_date")
                .le("planned_end_date", sevenDaysLater)
                .ge("planned_end_date", LocalDateTime.now());
        if (tenantId != null) highRiskQuery.eq("tenant_id", tenantId);
        List<ProductionOrder> highRiskOrders = productionOrderService.list(highRiskQuery);
        // 过滤进度<50%
        List<ProductionOrder> filtered = highRiskOrders.stream()
                .filter(o -> o.getProductionProgress() == null || o.getProductionProgress() < 50)
                .toList();
        risk.put("highRiskCount", filtered.size());

        List<Map<String, Object>> highRiskList = new ArrayList<>();
        int rlimit = Math.min(filtered.size(), 5);
        for (int i = 0; i < rlimit; i++) {
            ProductionOrder o = filtered.get(i);
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("orderNo", o.getOrderNo());
            dto.put("styleName", o.getStyleName());
            dto.put("factoryName", o.getFactoryName());
            dto.put("progress", (o.getProductionProgress() != null ? o.getProductionProgress() : 0) + "%");
            dto.put("deadline", o.getPlannedEndDate() != null ? o.getPlannedEndDate().toLocalDate().toString() : "未设置");
            highRiskList.add(dto);
        }
        risk.put("highRiskOrders", highRiskList);

        return risk;
    }

    private Map<String, Object> buildTodayStats(Long tenantId) {
        Map<String, Object> today = new LinkedHashMap<>();
        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);

        // 今日扫码量
        QueryWrapper<com.fashion.supplychain.production.entity.ScanRecord> scanQuery = new QueryWrapper<>();
        scanQuery.eq("scan_result", "success").ge("scan_time", todayStart);
        if (tenantId != null) scanQuery.eq("tenant_id", tenantId);
        long todayScanCount = scanRecordService.count(scanQuery);
        today.put("scanCount", todayScanCount);

        // 今日新建订单
        QueryWrapper<ProductionOrder> newOrderQuery = new QueryWrapper<>();
        newOrderQuery.eq("delete_flag", 0).ge("create_time", todayStart);
        if (tenantId != null) newOrderQuery.eq("tenant_id", tenantId);
        today.put("newOrderCount", productionOrderService.count(newOrderQuery));

        // 今日完成订单
        QueryWrapper<ProductionOrder> completedQuery = new QueryWrapper<>();
        completedQuery.eq("delete_flag", 0).eq("status", "COMPLETED").ge("update_time", todayStart);
        if (tenantId != null) completedQuery.eq("tenant_id", tenantId);
        today.put("completedTodayCount", productionOrderService.count(completedQuery));

        today.put("currentTime", LocalDateTime.now().toString());

        return today;
    }

    private Map<String, Object> buildStockStats(Long tenantId) {
        Map<String, Object> stock = new LinkedHashMap<>();

        QueryWrapper<com.fashion.supplychain.production.entity.MaterialStock> stockQuery = new QueryWrapper<>();
        if (tenantId != null) stockQuery.eq("tenant_id", tenantId);
        long totalItems = materialStockService.count(stockQuery);
        stock.put("totalMaterialTypes", totalItems);

        return stock;
    }
}
