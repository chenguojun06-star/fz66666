package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.production.service.MaterialStockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 系统全局概览统计工具 — 提供聚合数据帮助AI回答"系统有什么/状态/进度/卡点"
 * 增强版：含昨日对比、本周扫码趋势、紧急事项优先级排序
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

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private static final java.util.Set<String> TERMINAL_STATUSES = java.util.Set.of("completed", "cancelled", "scrapped", "archived", "closed");

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
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
            String factoryId = UserContext.factoryId();
            Map<String, Object> overview = new LinkedHashMap<>();

            // --- 生产订单统计 ---
            overview.put("production", buildProductionStats(tenantId, factoryId));

            // --- 风险与卡点 ---
            overview.put("risk", buildRiskStats(tenantId, factoryId));

            // --- 今日动态（含昨日对比） ---
            overview.put("today", buildTodayStats(tenantId, factoryId));

            // --- 库存概况 ---
            overview.put("stock", buildStockStats(tenantId, factoryId));

            // --- 当前最需关注事项（优先级排序） ---
            overview.put("topPriorities", buildTopPriorities(tenantId, factoryId));

            // --- 管理简报：给 AI 一个更像经营会议底稿的摘要 ---
            overview.put("managementBrief", buildManagementBrief(overview));

            return OBJECT_MAPPER.writeValueAsString(overview);
        } catch (Exception e) {
            log.error("SystemOverviewTool execution failed", e);
            return "{\"error\": \"系统概览查询失败: " + e.getMessage() + "\"}";
        }
    }

    private Map<String, Object> buildProductionStats(Long tenantId, String factoryId) {
        Map<String, Object> stats = new LinkedHashMap<>();

        QueryWrapper<ProductionOrder> baseQuery = new QueryWrapper<>();
        baseQuery.eq("delete_flag", 0);
        baseQuery.eq("tenant_id", tenantId);
        baseQuery.eq(StringUtils.hasText(factoryId), "factory_id", factoryId);
        long totalOrders = productionOrderService.count(baseQuery);

        // 各状态统计
        String[] statuses = {"PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"};
        Map<String, Long> statusCounts = new LinkedHashMap<>();
        for (String s : statuses) {
            QueryWrapper<ProductionOrder> q = new QueryWrapper<>();
            q.eq("delete_flag", 0).eq("status", s);
            q.eq("tenant_id", tenantId);
            q.eq(StringUtils.hasText(factoryId), "factory_id", factoryId);
            statusCounts.put(s, productionOrderService.count(q));
        }

        stats.put("totalOrders", totalOrders);
        stats.put("statusBreakdown", statusCounts);

        // 查询所有未删除订单的总件数
        QueryWrapper<ProductionOrder> allQuery = new QueryWrapper<>();
        allQuery.eq("delete_flag", 0);
        allQuery.eq("tenant_id", tenantId);
        allQuery.eq(StringUtils.hasText(factoryId), "factory_id", factoryId);
        List<ProductionOrder> allOrders = productionOrderService.list(allQuery);
        int totalOrderQuantity = allOrders.stream()
                .mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
        int totalCompletedQuantity = allOrders.stream()
                .mapToInt(o -> o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0).sum();
        stats.put("totalOrderQuantity", totalOrderQuantity);
        stats.put("totalCompletedQuantity", totalCompletedQuantity);

        // 平均进度（进行中订单）
        List<ProductionOrder> inProgressOrders = allOrders.stream()
                .filter(o -> "IN_PROGRESS".equals(o.getStatus())).toList();
        if (!inProgressOrders.isEmpty()) {
            double avgProgress = inProgressOrders.stream()
                    .mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0)
                    .average().orElse(0);
            stats.put("avgProgressPercent", Math.round(avgProgress));
            stats.put("inProgressCount", inProgressOrders.size());
            int inProgressQuantity = inProgressOrders.stream()
                    .mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
            stats.put("inProgressQuantity", inProgressQuantity);
        }

        return stats;
    }

    private Map<String, Object> buildRiskStats(Long tenantId, String factoryId) {
        Map<String, Object> risk = new LinkedHashMap<>();

        // 逾期订单（planned_end_date < now 且未完成）
        QueryWrapper<ProductionOrder> overdueQuery = new QueryWrapper<>();
        overdueQuery.eq("delete_flag", 0)
                .notIn("status", TERMINAL_STATUSES)
                .isNotNull("planned_end_date")
                .lt("planned_end_date", LocalDateTime.now());
        overdueQuery.eq("tenant_id", tenantId);
        overdueQuery.eq(StringUtils.hasText(factoryId), "factory_id", factoryId);
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
            dto.put("orderQuantity", o.getOrderQuantity());
            dto.put("completedQuantity", o.getCompletedQuantity());
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
        highRiskQuery.eq("tenant_id", tenantId);
        highRiskQuery.eq(StringUtils.hasText(factoryId), "factory_id", factoryId);
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
            dto.put("orderQuantity", o.getOrderQuantity());
            dto.put("completedQuantity", o.getCompletedQuantity());
            dto.put("progress", (o.getProductionProgress() != null ? o.getProductionProgress() : 0) + "%");
            dto.put("deadline", o.getPlannedEndDate() != null ? o.getPlannedEndDate().toLocalDate().toString() : "未设置");
            highRiskList.add(dto);
        }
        risk.put("highRiskOrders", highRiskList);

        return risk;
    }

    private Map<String, Object> buildTodayStats(Long tenantId, String factoryId) {
        Map<String, Object> today = new LinkedHashMap<>();
        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime yesterdayStart = todayStart.minusDays(1);
        LocalDateTime yesterdayEnd = LocalDateTime.of(LocalDate.now().minusDays(1), LocalTime.MAX);

        // 今日扫码量
        QueryWrapper<com.fashion.supplychain.production.entity.ScanRecord> scanQuery = new QueryWrapper<>();
        scanQuery.eq("scan_result", "success").ge("scan_time", todayStart);
        scanQuery.eq("tenant_id", tenantId);
        scanQuery.ne("scan_type", "orchestration");
        scanQuery.eq(StringUtils.hasText(factoryId), "factory_id", factoryId);
        long todayScanCount = scanRecordService.count(scanQuery);
        today.put("scanCount", todayScanCount);

        // 昨日扫码量（对比）
        QueryWrapper<com.fashion.supplychain.production.entity.ScanRecord> ydScanQ = new QueryWrapper<>();
        ydScanQ.eq("scan_result", "success").ge("scan_time", yesterdayStart).le("scan_time", yesterdayEnd);
        ydScanQ.eq("tenant_id", tenantId);
        ydScanQ.ne("scan_type", "orchestration");
        ydScanQ.eq(StringUtils.hasText(factoryId), "factory_id", factoryId);
        long yesterdayScanCount = scanRecordService.count(ydScanQ);
        today.put("yesterdayScanCount", yesterdayScanCount);
        today.put("scanTrend", todayScanCount >= yesterdayScanCount ? "↑" : "↓");

        // 今日新建订单
        QueryWrapper<ProductionOrder> newOrderQuery = new QueryWrapper<>();
        newOrderQuery.eq("delete_flag", 0).ge("create_time", todayStart);
        newOrderQuery.eq("tenant_id", tenantId);
        newOrderQuery.eq(StringUtils.hasText(factoryId), "factory_id", factoryId);
        today.put("newOrderCount", productionOrderService.count(newOrderQuery));

        // 今日完成订单
        QueryWrapper<ProductionOrder> completedQuery = new QueryWrapper<>();
        completedQuery.eq("delete_flag", 0).eq("status", "COMPLETED").ge("update_time", todayStart);
        completedQuery.eq("tenant_id", tenantId);
        completedQuery.eq(StringUtils.hasText(factoryId), "factory_id", factoryId);
        today.put("completedTodayCount", productionOrderService.count(completedQuery));

        today.put("currentTime", LocalDateTime.now().toString());

        return today;
    }

    private Map<String, Object> buildStockStats(Long tenantId, String factoryId) {
        Map<String, Object> stock = new LinkedHashMap<>();

        QueryWrapper<com.fashion.supplychain.production.entity.MaterialStock> stockQuery = new QueryWrapper<>();
        stockQuery.eq("tenant_id", tenantId);
        stockQuery.eq(StringUtils.hasText(factoryId), "factory_id", factoryId);
        long totalItems = materialStockService.count(stockQuery);
        stock.put("totalMaterialTypes", totalItems);

        return stock;
    }

    /**
     * 构建当前最需关注事项列表（优先级排序），帮助 AI 直接回答"现在最需要关注什么"
     */
    private List<Map<String, Object>> buildTopPriorities(Long tenantId, String factoryId) {
        List<Map<String, Object>> priorities = new ArrayList<>();

        // 已逾期订单 — 最高优先级
        QueryWrapper<ProductionOrder> overdueQ = new QueryWrapper<>();
        overdueQ.eq("delete_flag", 0).notIn("status", TERMINAL_STATUSES)
                .isNotNull("planned_end_date").lt("planned_end_date", LocalDateTime.now());
        overdueQ.eq("tenant_id", tenantId);
        overdueQ.eq(StringUtils.hasText(factoryId), "factory_id", factoryId);
        List<ProductionOrder> overdue = productionOrderService.list(overdueQ);
        for (ProductionOrder o : overdue.stream().limit(3).toList()) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("priority", "🔴 紧急");
            p.put("type", "已逾期");
            p.put("orderNo", o.getOrderNo());
            p.put("styleName", o.getStyleName());
            p.put("factoryName", o.getFactoryName());
            p.put("orderQuantity", o.getOrderQuantity());
            p.put("completedQuantity", o.getCompletedQuantity());
            p.put("progress", (o.getProductionProgress() != null ? o.getProductionProgress() : 0) + "%");
            p.put("suggestion", "立即联系工厂催进度，考虑标记为紧急订单");
            priorities.add(p);
        }

        // 3天内到期 进度<80% — 高优先级
        QueryWrapper<ProductionOrder> urgentQ = new QueryWrapper<>();
        urgentQ.eq("delete_flag", 0).eq("status", "IN_PROGRESS").isNotNull("planned_end_date")
                .le("planned_end_date", LocalDateTime.now().plusDays(3))
                .ge("planned_end_date", LocalDateTime.now());
        urgentQ.eq("tenant_id", tenantId);
        urgentQ.eq(StringUtils.hasText(factoryId), "factory_id", factoryId);
        List<ProductionOrder> urgentSoon = productionOrderService.list(urgentQ).stream()
                .filter(o -> o.getProductionProgress() == null || o.getProductionProgress() < 80)
                .toList();
        for (ProductionOrder o : urgentSoon.stream().limit(3).toList()) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("priority", "🟠 高");
            p.put("type", "即将到期");
            p.put("orderNo", o.getOrderNo());
            p.put("styleName", o.getStyleName());
            p.put("factoryName", o.getFactoryName());
            p.put("orderQuantity", o.getOrderQuantity());
            p.put("completedQuantity", o.getCompletedQuantity());
            p.put("progress", (o.getProductionProgress() != null ? o.getProductionProgress() : 0) + "%");
            p.put("daysRemaining", java.time.Duration.between(LocalDateTime.now(), o.getPlannedEndDate()).toDays());
            p.put("suggestion", "需加班赶工或协调其他工厂分担产能");
            priorities.add(p);
        }

        // 零进度进行中订单 — 中优先级
        QueryWrapper<ProductionOrder> zeroQ = new QueryWrapper<>();
        zeroQ.eq("delete_flag", 0).eq("status", "IN_PROGRESS")
                .and(w -> w.isNull("production_progress").or().eq("production_progress", 0));
        zeroQ.eq("tenant_id", tenantId);
        zeroQ.eq(StringUtils.hasText(factoryId), "factory_id", factoryId);
        long zeroProgressCount = productionOrderService.count(zeroQ);
        if (zeroProgressCount > 0) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("priority", "🟡 中");
            p.put("type", "停滞订单");
            p.put("count", zeroProgressCount);
            p.put("suggestion", "检查这些订单是否缺面料、缺工人、或未排产");
            priorities.add(p);
        }

        return priorities;
    }

    private Map<String, Object> buildManagementBrief(Map<String, Object> overview) {
        Map<String, Object> brief = new LinkedHashMap<>();

        @SuppressWarnings("unchecked")
        Map<String, Object> production = (Map<String, Object>) overview.getOrDefault("production", Map.of());
        @SuppressWarnings("unchecked")
        Map<String, Object> risk = (Map<String, Object>) overview.getOrDefault("risk", Map.of());
        @SuppressWarnings("unchecked")
        Map<String, Object> today = (Map<String, Object>) overview.getOrDefault("today", Map.of());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> priorities = (List<Map<String, Object>>) overview.getOrDefault("topPriorities", List.of());

        long overdueCount = toLong(risk.get("overdueCount"));
        long highRiskCount = toLong(risk.get("highRiskCount"));
        long totalOrders = toLong(production.get("totalOrders"));
        long todayScanCount = toLong(today.get("scanCount"));
        String avgProgress = String.valueOf(production.getOrDefault("avgProgressPercent", 0)) + "%";

        String riskLevel;
        if (overdueCount > 0) {
            riskLevel = "RED";
        } else if (highRiskCount >= 3) {
            riskLevel = "ORANGE";
        } else if (highRiskCount > 0) {
            riskLevel = "YELLOW";
        } else {
            riskLevel = "GREEN";
        }

        String headline;
        if (overdueCount > 0) {
            headline = String.format("当前最紧急的问题是交期失守，已有%s张订单逾期。", overdueCount);
        } else if (highRiskCount > 0) {
            headline = String.format("当前需要优先压降交期风险，近7天内有%s张高风险订单。", highRiskCount);
        } else {
            headline = String.format("当前整体运行相对平稳，总订单%s张，进行中平均进度%s，今日扫码%s次。", totalOrders, avgProgress, todayScanCount);
        }

        brief.put("riskLevel", riskLevel);
        brief.put("headline", headline);
        brief.put("focusSummary", priorities.isEmpty()
                ? "当前没有突出优先事项，建议继续关注进度和缺料变化。"
                : buildPrioritySummary(priorities));
        brief.put("ownerRoles", buildOwnerRoles(overdueCount, highRiskCount, priorities));
        brief.put("recommendedActions", buildRecommendedActions(overdueCount, highRiskCount, priorities));
        brief.put("expectedOutcome", overdueCount > 0
                ? "先处理逾期与临期订单，可优先止住客户与交期风险扩散。"
                : highRiskCount > 0
                ? "先压降高风险订单，可把本周货期失守概率往下压。"
                : "保持当前节奏，同时持续监控风险订单、缺料和停滞情况。"
        );
        return brief;
    }

    private String buildPrioritySummary(List<Map<String, Object>> priorities) {
        return priorities.stream().limit(3)
                .map(item -> String.format("%s-%s%s",
                        String.valueOf(item.getOrDefault("priority", "")),
                        String.valueOf(item.getOrDefault("type", "")),
                        item.get("orderNo") != null ? "(" + item.get("orderNo") + ")" : ""))
                .collect(Collectors.joining("；"));
    }

    private List<String> buildOwnerRoles(long overdueCount, long highRiskCount, List<Map<String, Object>> priorities) {
        LinkedHashSet<String> roles = new LinkedHashSet<>();
        if (overdueCount > 0 || highRiskCount > 0) {
            roles.add("跟单");
            roles.add("生产主管");
            roles.add("工厂负责人");
        }
        boolean hasStagnant = priorities.stream().anyMatch(item -> "停滞订单".equals(item.get("type")));
        if (hasStagnant) {
            roles.add("采购");
        }
        if (roles.isEmpty()) {
            roles.add("跟单");
        }
        return new ArrayList<>(roles);
    }

    private List<String> buildRecommendedActions(long overdueCount, long highRiskCount, List<Map<String, Object>> priorities) {
        List<String> actions = new ArrayList<>();
        if (overdueCount > 0) {
            actions.add("先逐张确认逾期订单的卡点原因，优先处理已逾期订单的工厂排产与交付承诺。");
        }
        if (highRiskCount > 0) {
            actions.add("把7天内到期且进度偏低的订单拉清单，按剩余天数和进度差排序，安排加急跟进。");
        }
        boolean hasStagnant = priorities.stream().anyMatch(item -> "停滞订单".equals(item.get("type")));
        if (hasStagnant) {
            actions.add("排查停滞订单是缺料、缺人还是未排产，分别交给采购、生产主管和工厂负责人处理。");
        }
        if (actions.isEmpty()) {
            actions.add("继续盯住临期订单、扫码波动和库存缺口，避免平稳状态被突发问题打断。");
        }
        return actions.stream().limit(3).collect(Collectors.toList());
    }

    private long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null) {
            return 0L;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }
}
