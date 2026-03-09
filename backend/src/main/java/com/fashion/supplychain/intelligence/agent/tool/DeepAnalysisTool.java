package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 深度分析工具 — 工厂排名/瓶颈分析/跟单员负载/交期风险/成本分析
 * 提供多维度业务洞察，帮助 AI 给出真正有数据支撑的建议
 */
@Slf4j
@Component
public class DeepAnalysisTool implements AgentTool {

    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private ScanRecordService scanRecordService;

    private static final ObjectMapper mapper = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_deep_analysis";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> analysisType = new LinkedHashMap<>();
        analysisType.put("type", "string");
        analysisType.put("description", "分析类型：factory_ranking(工厂效率排名), bottleneck(瓶颈工序分析), " +
                "merchandiser_load(跟单员负载分析), delivery_risk(交期风险评估), cost_analysis(成本分析), " +
                "order_type_breakdown(订单类型分布)");
        properties.put("analysisType", analysisType);

        Map<String, Object> days = new LinkedHashMap<>();
        days.put("type", "integer");
        days.put("description", "分析时间跨度(天数)，默认30天");
        properties.put("days", days);

        Map<String, Object> factoryName = new LinkedHashMap<>();
        factoryName.put("type", "string");
        factoryName.put("description", "指定工厂名称（仅部分分析类型需要）");
        properties.put("factoryName", factoryName);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("深度业务分析工具，提供工厂效率排名、工序瓶颈识别、跟单员负载均衡、交期风险评估、成本分析。" +
                "当用户问'哪个工厂效率最高'、'瓶颈在哪里'、'哪个跟单员最忙'、'哪些订单可能延期'、" +
                "'费用花在哪里'、'新单vs翻单比例'时调用此工具。");

        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        aiParams.setRequired(List.of("analysisType"));
        function.setParameters(aiParams);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        log.info("Tool: {} called with args: {}", getName(), argumentsJson);
        Map<String, Object> args = new HashMap<>();
        if (argumentsJson != null && !argumentsJson.isBlank()) {
            args = mapper.readValue(argumentsJson, new TypeReference<>() {});
        }

        String analysisType = (String) args.getOrDefault("analysisType", "factory_ranking");
        int days = args.containsKey("days") ? ((Number) args.get("days")).intValue() : 30;
        String factoryName = (String) args.get("factoryName");
        Long tenantId = UserContext.tenantId();
        LocalDateTime since = LocalDateTime.now().minusDays(days);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("analysisType", analysisType);
        result.put("timeRange", days + "天");

        switch (analysisType) {
            case "factory_ranking" -> result.put("data", analyzeFactoryRanking(tenantId, since));
            case "bottleneck" -> result.put("data", analyzeBottleneck(tenantId, since, factoryName));
            case "merchandiser_load" -> result.put("data", analyzeMerchandiserLoad(tenantId));
            case "delivery_risk" -> result.put("data", analyzeDeliveryRisk(tenantId));
            case "cost_analysis" -> result.put("data", analyzeCost(tenantId, since));
            case "order_type_breakdown" -> result.put("data", analyzeOrderTypes(tenantId, since));
            default -> result.put("error", "不支持的分析类型: " + analysisType);
        }

        return mapper.writeValueAsString(result);
    }

    private List<Map<String, Object>> analyzeFactoryRanking(Long tenantId, LocalDateTime since) {
        // 获取进行中+已完成的订单
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
        q.in("status", "IN_PROGRESS", "COMPLETED").isNotNull("factory_name");
        List<ProductionOrder> orders = productionOrderService.list(q);

        // 按工厂分组
        Map<String, List<ProductionOrder>> grouped = orders.stream()
                .filter(o -> o.getFactoryName() != null && !o.getFactoryName().isBlank())
                .collect(Collectors.groupingBy(ProductionOrder::getFactoryName));

        return grouped.entrySet().stream().map(e -> {
            List<ProductionOrder> fOrders = e.getValue();
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("factoryName", e.getKey());
            dto.put("totalOrders", fOrders.size());

            long completed = fOrders.stream().filter(o -> "COMPLETED".equals(o.getStatus())).count();
            long inProgress = fOrders.stream().filter(o -> "IN_PROGRESS".equals(o.getStatus())).count();
            dto.put("completed", completed);
            dto.put("inProgress", inProgress);

            // 平均进度
            double avgProgress = fOrders.stream()
                    .mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0)
                    .average().orElse(0);
            dto.put("avgProgress", Math.round(avgProgress) + "%");

            // 逾期率
            long overdue = fOrders.stream()
                    .filter(o -> !"COMPLETED".equals(o.getStatus()) && o.getPlannedEndDate() != null
                            && o.getPlannedEndDate().isBefore(LocalDateTime.now()))
                    .count();
            dto.put("overdueCount", overdue);
            dto.put("overdueRate", fOrders.isEmpty() ? "0%" :
                    String.format("%.1f%%", (double) overdue / fOrders.size() * 100));

            // 总件数
            int totalQty = fOrders.stream().mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
            dto.put("totalQuantity", totalQty);

            // 综合评分：完成率40% + 准时率30% + 平均进度30%
            double completionScore = fOrders.isEmpty() ? 0 : (double) completed / fOrders.size() * 100;
            double onTimeRate = fOrders.isEmpty() ? 100 : (1 - (double) overdue / fOrders.size()) * 100;
            double score = completionScore * 0.4 + onTimeRate * 0.3 + avgProgress * 0.3;
            dto.put("efficiencyScore", Math.round(score));

            return dto;
        }).sorted((a, b) -> Long.compare((long) b.get("efficiencyScore"), (long) a.get("efficiencyScore")))
                .collect(Collectors.toList());
    }

    private Map<String, Object> analyzeBottleneck(Long tenantId, LocalDateTime since, String factoryFilter) {
        Map<String, Object> result = new LinkedHashMap<>();

        // 查询最近扫码记录，按工序阶段分组
        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId);
        q.ge("scan_time", since).isNotNull("progress_stage");
        List<ScanRecord> scans = scanRecordService.list(q);

        // 按工序阶段聚合
        Map<String, long[]> stageStats = new LinkedHashMap<>(); // stage -> [count, qty]
        for (ScanRecord s : scans) {
            String stage = s.getProgressStage();
            if (stage == null || stage.isBlank()) continue;
            stageStats.computeIfAbsent(stage, k -> new long[2]);
            stageStats.get(stage)[0]++;
            stageStats.get(stage)[1] += s.getQuantity() != null ? s.getQuantity() : 0;
        }

        List<Map<String, Object>> stages = stageStats.entrySet().stream()
                .map(e -> {
                    Map<String, Object> dto = new LinkedHashMap<>();
                    dto.put("stage", e.getKey());
                    dto.put("scanCount", e.getValue()[0]);
                    dto.put("totalQuantity", e.getValue()[1]);
                    return dto;
                })
                .sorted((a, b) -> Long.compare((long) b.get("totalQuantity"), (long) a.get("totalQuantity")))
                .collect(Collectors.toList());
        result.put("stageDistribution", stages);

        // 找出进度最慢的阶段（通过订单进度分布）
        QueryWrapper<ProductionOrder> oq = baseOrderQuery(tenantId);
        oq.eq("status", "IN_PROGRESS");
        if (factoryFilter != null && !factoryFilter.isBlank()) {
            oq.like("factory_name", factoryFilter);
        }
        List<ProductionOrder> ipOrders = productionOrderService.list(oq);

        // 进度分桶
        Map<String, Long> progressBuckets = new LinkedHashMap<>();
        progressBuckets.put("0-20%", ipOrders.stream().filter(o -> progress(o) <= 20).count());
        progressBuckets.put("21-40%", ipOrders.stream().filter(o -> progress(o) > 20 && progress(o) <= 40).count());
        progressBuckets.put("41-60%", ipOrders.stream().filter(o -> progress(o) > 40 && progress(o) <= 60).count());
        progressBuckets.put("61-80%", ipOrders.stream().filter(o -> progress(o) > 60 && progress(o) <= 80).count());
        progressBuckets.put("81-100%", ipOrders.stream().filter(o -> progress(o) > 80).count());
        result.put("progressDistribution", progressBuckets);
        result.put("inProgressCount", ipOrders.size());

        return result;
    }

    private List<Map<String, Object>> analyzeMerchandiserLoad(Long tenantId) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
        q.ne("status", "COMPLETED").ne("status", "CANCELLED").isNotNull("merchandiser");
        List<ProductionOrder> active = productionOrderService.list(q);

        Map<String, List<ProductionOrder>> byMerchandiser = active.stream()
                .filter(o -> o.getMerchandiser() != null && !o.getMerchandiser().isBlank())
                .collect(Collectors.groupingBy(ProductionOrder::getMerchandiser));

        return byMerchandiser.entrySet().stream().map(e -> {
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("merchandiser", e.getKey());
            dto.put("activeOrders", e.getValue().size());

            int totalQty = e.getValue().stream().mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
            dto.put("totalQuantity", totalQty);

            long urgent = e.getValue().stream().filter(o -> "urgent".equals(o.getUrgencyLevel())).count();
            dto.put("urgentCount", urgent);

            long overdue = e.getValue().stream()
                    .filter(o -> o.getPlannedEndDate() != null && o.getPlannedEndDate().isBefore(LocalDateTime.now()))
                    .count();
            dto.put("overdueCount", overdue);

            double avgProgress = e.getValue().stream().mapToInt(o -> progress(o)).average().orElse(0);
            dto.put("avgProgress", Math.round(avgProgress) + "%");

            // 负载评级
            int load = e.getValue().size();
            dto.put("loadLevel", load >= 15 ? "超载" : load >= 10 ? "高" : load >= 5 ? "适中" : "轻松");

            return dto;
        }).sorted((a, b) -> ((int) b.get("activeOrders")) - ((int) a.get("activeOrders")))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> analyzeDeliveryRisk(Long tenantId) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
        q.ne("status", "COMPLETED").ne("status", "CANCELLED").isNotNull("planned_end_date");
        List<ProductionOrder> orders = productionOrderService.list(q);

        LocalDateTime now = LocalDateTime.now();
        return orders.stream().map(o -> {
            Map<String, Object> dto = orderBrief(o);
            long daysRemaining = java.time.Duration.between(now, o.getPlannedEndDate()).toDays();
            int prog = progress(o);

            dto.put("daysRemaining", daysRemaining);
            dto.put("progress", prog + "%");

            // 风险评分算法：剩余天数越少 + 进度越低 = 风险越高
            String riskLevel;
            if (daysRemaining < 0) {
                riskLevel = "已逾期";
            } else if (daysRemaining <= 3 && prog < 80) {
                riskLevel = "极高";
            } else if (daysRemaining <= 7 && prog < 50) {
                riskLevel = "高";
            } else if (daysRemaining <= 14 && prog < 30) {
                riskLevel = "中";
            } else {
                riskLevel = "低";
            }
            dto.put("riskLevel", riskLevel);
            return dto;
        }).filter(dto -> !"低".equals(dto.get("riskLevel")))
                .sorted((a, b) -> {
                    Map<String, Integer> order = Map.of("已逾期", 0, "极高", 1, "高", 2, "中", 3);
                    return order.getOrDefault(a.get("riskLevel"), 4) - order.getOrDefault(b.get("riskLevel"), 4);
                })
                .limit(20)
                .collect(Collectors.toList());
    }

    private Map<String, Object> analyzeCost(Long tenantId, LocalDateTime since) {
        Map<String, Object> result = new LinkedHashMap<>();

        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId);
        q.ge("scan_time", since).isNotNull("total_amount");
        List<ScanRecord> scans = scanRecordService.list(q);

        BigDecimal total = scans.stream()
                .map(s -> s.getTotalAmount() != null ? s.getTotalAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        result.put("totalAmount", total.setScale(2, RoundingMode.HALF_UP));

        // 按工序阶段分组
        Map<String, BigDecimal> byStage = scans.stream()
                .filter(s -> s.getProgressStage() != null)
                .collect(Collectors.groupingBy(ScanRecord::getProgressStage,
                        Collectors.reducing(BigDecimal.ZERO,
                                s -> s.getTotalAmount() != null ? s.getTotalAmount() : BigDecimal.ZERO,
                                BigDecimal::add)));
        Map<String, String> formatted = new LinkedHashMap<>();
        byStage.entrySet().stream()
                .sorted((a, b) -> b.getValue().compareTo(a.getValue()))
                .forEach(e -> formatted.put(e.getKey(), e.getValue().setScale(2, RoundingMode.HALF_UP).toString()));
        result.put("costByStage", formatted);

        // 按工厂分组
        Map<String, BigDecimal> byFactory = new LinkedHashMap<>();
        for (ScanRecord s : scans) {
            String fid = s.getFactoryId();
            if (fid == null) fid = "未知";
            byFactory.merge(fid, s.getTotalAmount() != null ? s.getTotalAmount() : BigDecimal.ZERO, BigDecimal::add);
        }
        result.put("costByFactory", byFactory.entrySet().stream()
                .sorted((a, b) -> b.getValue().compareTo(a.getValue()))
                .limit(5)
                .collect(LinkedHashMap::new, (m, e) -> m.put(e.getKey(), e.getValue().setScale(2, RoundingMode.HALF_UP).toString()), Map::putAll));

        return result;
    }

    private Map<String, Object> analyzeOrderTypes(Long tenantId, LocalDateTime since) {
        Map<String, Object> result = new LinkedHashMap<>();

        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
        q.ge("create_time", since);
        List<ProductionOrder> orders = productionOrderService.list(q);

        result.put("totalOrders", orders.size());

        // 按 plateType (FIRST/REORDER) 分
        Map<String, Long> byPlateType = orders.stream()
                .collect(Collectors.groupingBy(o -> o.getPlateType() != null ? o.getPlateType() : "未知", Collectors.counting()));
        result.put("byPlateType", byPlateType);

        // 按 orderBizType (FOB/ODM/OEM/CMT)
        Map<String, Long> byBizType = orders.stream()
                .collect(Collectors.groupingBy(o -> o.getOrderBizType() != null ? o.getOrderBizType() : "未知", Collectors.counting()));
        result.put("byBizType", byBizType);

        // 按 factoryType (INTERNAL/EXTERNAL)
        Map<String, Long> byFactoryType = orders.stream()
                .collect(Collectors.groupingBy(o -> o.getFactoryType() != null ? o.getFactoryType() : "未知", Collectors.counting()));
        result.put("byFactoryType", byFactoryType);

        // 按紧急程度
        Map<String, Long> byUrgency = orders.stream()
                .collect(Collectors.groupingBy(o -> o.getUrgencyLevel() != null ? o.getUrgencyLevel() : "normal", Collectors.counting()));
        result.put("byUrgency", byUrgency);

        return result;
    }

    // ---- helpers ----
    private int progress(ProductionOrder o) {
        return o.getProductionProgress() != null ? o.getProductionProgress() : 0;
    }

    private QueryWrapper<ScanRecord> baseScanQuery(Long tenantId) {
        QueryWrapper<ScanRecord> q = new QueryWrapper<>();
        q.eq("scan_result", "success");
        if (tenantId != null) q.eq("tenant_id", tenantId);
        return q;
    }

    private QueryWrapper<ProductionOrder> baseOrderQuery(Long tenantId) {
        QueryWrapper<ProductionOrder> q = new QueryWrapper<>();
        q.eq("delete_flag", 0);
        if (tenantId != null) q.eq("tenant_id", tenantId);
        return q;
    }

    private Map<String, Object> orderBrief(ProductionOrder o) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("orderNo", o.getOrderNo());
        dto.put("styleName", o.getStyleName());
        dto.put("factoryName", o.getFactoryName());
        dto.put("company", o.getCompany());
        dto.put("merchandiser", o.getMerchandiser());
        dto.put("orderQuantity", o.getOrderQuantity());
        dto.put("urgencyLevel", o.getUrgencyLevel());
        return dto;
    }
}
