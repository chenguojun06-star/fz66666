package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 深度分析工具 — 工厂排名/瓶颈分析/跟单员负载/交期风险/成本分析
 * 提供多维度业务洞察，帮助 AI 给出真正有数据支撑的建议
 */
@Slf4j
@Component
public class DeepAnalysisTool extends AbstractAgentTool {

    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private ScanRecordService scanRecordService;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final java.util.Set<String> TERMINAL_STATUSES = java.util.Set.of("completed", "cancelled", "scrapped", "archived", "closed");

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
    protected String doExecute(String argumentsJson) throws Exception {
        log.info("Tool: {} called with args: {}", getName(), argumentsJson);
        Map<String, Object> args = new HashMap<>();
        if (argumentsJson != null && !argumentsJson.isBlank()) {
            args = MAPPER.readValue(argumentsJson, new TypeReference<>() {});
        }

        String analysisType = (String) args.getOrDefault("analysisType", "factory_ranking");
        int days = args.containsKey("days") ? ((Number) args.get("days")).intValue() : 30;
        String factoryName = (String) args.get("factoryName");
        TenantAssert.assertTenantContext();
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

        if (!result.containsKey("error")) {
            result.put("managementBrief", buildManagementBrief(analysisType, result.get("data")));
        }

        return MAPPER.writeValueAsString(result);
    }

    private Map<String, Object> buildManagementBrief(String analysisType, Object data) {
        Map<String, Object> brief = new LinkedHashMap<>();
        switch (analysisType) {
            case "factory_ranking" -> fillFactoryRankingBrief(brief, castList(data));
            case "bottleneck" -> fillBottleneckBrief(brief, castMap(data));
            case "merchandiser_load" -> fillMerchandiserBrief(brief, castList(data));
            case "delivery_risk" -> fillDeliveryRiskBrief(brief, castList(data));
            case "cost_analysis" -> fillCostBrief(brief, castMap(data));
            case "order_type_breakdown" -> fillOrderTypeBrief(brief, castMap(data));
            default -> {
                brief.put("riskLevel", "YELLOW");
                brief.put("headline", "分析已完成，但暂未生成管理简报。");
                brief.put("ownerRoles", List.of("跟单"));
                brief.put("recommendedActions", List.of("请结合原始数据进一步确认处理动作。"));
            }
        }
        return brief;
    }

    private void fillFactoryRankingBrief(Map<String, Object> brief, List<Map<String, Object>> rows) {
        if (rows.isEmpty()) {
            brief.put("riskLevel", "YELLOW");
            brief.put("headline", "当前没有足够工厂数据形成排名。\n");
            brief.put("ownerRoles", List.of("生产主管"));
            brief.put("recommendedActions", List.of("先补齐工厂订单和进度数据后再分析。"));
            return;
        }
        Map<String, Object> best = rows.get(0);
        Map<String, Object> worst = rows.get(rows.size() - 1);
        brief.put("riskLevel", toLong(worst.get("overdueCount")) > 0 ? "ORANGE" : "GREEN");
        brief.put("headline", String.format("当前工厂效率分化明显，%s领先，%s需要重点跟进。",
                best.get("factoryName"), worst.get("factoryName")));
        brief.put("ownerRoles", List.of("生产主管", "跟单", "工厂负责人"));
        brief.put("recommendedActions", List.of(
                String.format("优先复盘%s的排产和交付节奏，复制可复用做法。", best.get("factoryName")),
                String.format("重点追踪%s的逾期和低进度订单，确认是产能不足还是现场执行问题。", worst.get("factoryName")),
                "对效率垫底工厂重新评估派单占比，避免继续放大交期风险。"
        ));
    }

    private void fillBottleneckBrief(Map<String, Object> brief, Map<String, Object> data) {
        List<Map<String, Object>> stageDistribution = castList(data.get("stageDistribution"));
        Map<String, Object> progressDistribution = castMap(data.get("progressDistribution"));
        String stage = stageDistribution.isEmpty() ? "未识别" : String.valueOf(stageDistribution.get(0).get("stage"));
        long earlyStageCount = toLong(progressDistribution.get("0-20%")) + toLong(progressDistribution.get("21-40%"));
        brief.put("riskLevel", earlyStageCount > 0 ? "ORANGE" : "YELLOW");
        brief.put("headline", String.format("当前主要瓶颈集中在%s，前中段订单积压偏多。", stage));
        brief.put("ownerRoles", List.of("生产主管", "工厂负责人", "跟单"));
        brief.put("recommendedActions", List.of(
                String.format("先核查%s阶段的人手、设备和返工情况，确认瓶颈是真缺产能还是节拍失衡。", stage),
                "把0-40%进度订单按工厂和交期分组，优先处理临期订单所在批次。",
                "必要时做工序前移备料或临时调线，避免前段堵住后段。"
        ));
    }

    private void fillMerchandiserBrief(Map<String, Object> brief, List<Map<String, Object>> rows) {
        if (rows.isEmpty()) {
            brief.put("riskLevel", "YELLOW");
            brief.put("headline", "当前没有可用的跟单负载数据。\n");
            brief.put("ownerRoles", List.of("老板"));
            brief.put("recommendedActions", List.of("先补齐订单跟单员字段，再做负载均衡。"));
            return;
        }
        Map<String, Object> top = rows.get(0);
        brief.put("riskLevel", "ORANGE");
        brief.put("headline", String.format("当前%s负载最高，继续叠单会放大跟单失控风险。", top.get("merchandiser")));
        brief.put("ownerRoles", List.of("老板", "跟单主管"));
        brief.put("recommendedActions", List.of(
                String.format("先复核%s手上的紧急单和逾期单，确认是否需要拆单给其他跟单员。", top.get("merchandiser")),
                "按订单数、急单数、逾期数重新平衡人员分工，而不是只看订单总量。",
                "负载持续超载的跟单员，需要减少新增复杂订单承接。"
        ));
    }

    private void fillDeliveryRiskBrief(Map<String, Object> brief, List<Map<String, Object>> rows) {
        long overdue = rows.stream().filter(row -> "已逾期".equals(row.get("riskLevel"))).count();
        long extreme = rows.stream().filter(row -> "极高".equals(row.get("riskLevel"))).count();
        brief.put("riskLevel", overdue > 0 ? "RED" : extreme > 0 ? "ORANGE" : "YELLOW");
        brief.put("headline", overdue > 0
                ? String.format("交期风险已经落地，当前有%s张订单逾期。", overdue)
                : String.format("交期风险正在积聚，当前有%s张极高风险订单。", extreme));
        brief.put("ownerRoles", List.of("跟单", "生产主管", "工厂负责人"));
        brief.put("recommendedActions", List.of(
                "把逾期和极高风险订单单独列清单，逐张确认剩余天数、差异进度和现场卡点。",
                "对临期但进度偏低的订单，优先争取加班、插单或产能转移。",
                "同步给客户和内部团队预警，避免最后一天才暴露交期问题。"
        ));
    }

    private void fillCostBrief(Map<String, Object> brief, Map<String, Object> data) {
        Map<String, Object> costByStage = castMap(data.get("costByStage"));
        String topStage = costByStage.isEmpty() ? "未识别" : String.valueOf(costByStage.keySet().iterator().next());
        brief.put("riskLevel", costByStage.isEmpty() ? "YELLOW" : "ORANGE");
        brief.put("headline", String.format("当前成本压力主要集中在%s阶段，需要确认是单价问题还是返工问题。", topStage));
        brief.put("ownerRoles", List.of("财务", "IE", "生产主管"));
        brief.put("recommendedActions", List.of(
                String.format("先拆解%s阶段的金额构成，区分正常工价、返工和异常补贴。", topStage),
                "把高成本工厂与高返工工序交叉比对，找出异常成本来源。",
                "把异常成本订单拉出来做复盘，避免同类问题重复发生。"
        ));
    }

    private void fillOrderTypeBrief(Map<String, Object> brief, Map<String, Object> data) {
        brief.put("riskLevel", "GREEN");
        brief.put("headline", String.format("当前订单结构已完成拆分，共统计%s张订单，可用于判断接单结构是否健康。", data.getOrDefault("totalOrders", 0)));
        brief.put("ownerRoles", List.of("老板", "业务", "生产主管"));
        brief.put("recommendedActions", List.of(
                "先看新单、翻单、急单占比是否失衡，再决定排产和工厂分配策略。",
                "结合工厂类型和业务类型，判断哪些订单该优先内配，哪些该外发。",
                "如果急单占比持续偏高，要回头检查接单节奏和客户承诺策略。"
        ));
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> castList(Object value) {
        return value instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
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

    private List<Map<String, Object>> analyzeFactoryRanking(Long tenantId, LocalDateTime since) {
        // 获取进行中+已完成的订单
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
        q.in("status", "IN_PROGRESS", "COMPLETED").isNotNull("factory_name").last("LIMIT 5000");
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
        q.ge("scan_time", since).isNotNull("progress_stage").last("LIMIT 5000");
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
        List<ProductionOrder> ipOrders = productionOrderService.list(oq.last("LIMIT 5000"));

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
        q.notIn("status", TERMINAL_STATUSES).isNotNull("merchandiser").last("LIMIT 5000");
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
        q.notIn("status", TERMINAL_STATUSES).isNotNull("planned_end_date").last("LIMIT 5000");
        List<ProductionOrder> orders = productionOrderService.list(q);

        LocalDateTime now = LocalDateTime.now();
        return orders.stream().map(o -> {
            Map<String, Object> dto = orderBrief(o);
            LocalDate deadline = o.getExpectedShipDate() != null ? o.getExpectedShipDate().toLocalDate() : o.getPlannedEndDate().toLocalDate();
            long daysRemaining = java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), deadline);
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
        q.ge("scan_time", since).isNotNull("total_amount").last("LIMIT 5000");
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
        q.ge("create_time", since).last("LIMIT 5000");
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
        q.eq("tenant_id", tenantId);
        q.ne("scan_type", "orchestration");
        
        // 工厂隔离
        String factoryId = UserContext.factoryId();
        if (factoryId != null && !factoryId.isBlank()) {
            q.eq("factory_id", factoryId);
        }
        
        return q;
    }

    private QueryWrapper<ProductionOrder> baseOrderQuery(Long tenantId) {
        QueryWrapper<ProductionOrder> q = new QueryWrapper<>();
        q.eq("delete_flag", 0);
        q.eq("tenant_id", tenantId);
        
        // 工厂隔离
        String factoryId = UserContext.factoryId();
        if (factoryId != null && !factoryId.isBlank()) {
            q.eq("factory_id", factoryId);
        }
        
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
        dto.put("completedQuantity", o.getCompletedQuantity());
        dto.put("urgencyLevel", o.getUrgencyLevel());
        dto.put("expectedShipDate", o.getExpectedShipDate() != null
                ? o.getExpectedShipDate().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")) : "-");
        dto.put("plannedEndDate", o.getPlannedEndDate() != null ? o.getPlannedEndDate().toLocalDate().toString() : "-");
        return dto;
    }
}
