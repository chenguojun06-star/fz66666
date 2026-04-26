package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.system.entity.OrganizationUnit;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.orchestration.OrganizationUnitOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
public class OrgQueryTool extends AbstractAgentTool {

    @Autowired
    private OrganizationUnitOrchestrator orgOrchestrator;
    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private ScanRecordService scanRecordService;
    @Autowired
    private AiAgentToolAccessService toolAccessService;

    @Override
    public String getName() {
        return "tool_org_query";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.PRODUCTION;
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: tree | departments | members | capacity_analysis | workload_analysis"));
        return buildToolDef(
                "组织架构与产能分析：查询部门树/部门列表/成员分布，以及产能分析（各工厂产能利用率/瓶颈识别）、工作量分析。用户说「组织」「部门」「产能」「工作量」时必须调用。",
                properties, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (UserContext.factoryId() != null
                && ("capacity_analysis".equals(action) || "workload_analysis".equals(action))) {
            return errorJson("外发工厂账号无权访问产能和工作量分析数据");
        }
        return switch (action) {
            case "tree" -> queryTree();
            case "departments" -> queryDepartments();
            case "members" -> queryMembers();
            case "capacity_analysis" -> capacityAnalysis();
            case "workload_analysis" -> workloadAnalysis();
            default -> errorJson("不支持的 action：" + action + "，可用：tree / departments / members / capacity_analysis / workload_analysis");
        };
    }

    private String queryTree() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<OrganizationUnit> tree = orgOrchestrator.tree();
        if (tenantId != null && !UserContext.isSuperAdmin()) {
            tree = tree.stream().filter(u -> tenantId.equals(u.getTenantId())).toList();
        }
        return successJson("获取组织架构树成功", Map.of("tree", tree, "total", tree.size()));
    }

    private String queryDepartments() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<OrganizationUnit> depts = orgOrchestrator.departmentOptions();
        if (tenantId != null && !UserContext.isSuperAdmin()) {
            depts = depts.stream().filter(u -> tenantId.equals(u.getTenantId())).toList();
        }
        return successJson("获取部门列表成功", Map.of("departments", depts, "total", depts.size()));
    }

    private String queryMembers() throws Exception {
        TenantAssert.assertTenantContext();
        Map<String, List<User>> members = orgOrchestrator.membersByOrgUnit();
        return successJson("获取成员分布成功", Map.of("membersByDept", members, "deptCount", members.size()));
    }

    private String capacityAnalysis() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<ProductionOrder> activeOrders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "completed", "cancelled", "scrapped", "archived", "closed")
                .isNotNull(ProductionOrder::getFactoryName)
                .last("LIMIT 5000")
                .list();

        LocalDateTime sevenDaysAgo = LocalDateTime.now().minusDays(7);
        List<ScanRecord> recentScans = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getTenantId, tenantId)
                .ge(ScanRecord::getScanTime, sevenDaysAgo)
                .ne(ScanRecord::getScanType, "orchestration")
                .last("LIMIT 5000")
                .list();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);

        Map<String, Object> overview = buildCapacityOverview(activeOrders, recentScans);
        result.put("overview", overview);

        Map<String, Object> byFactory = buildCapacityByFactory(activeOrders, recentScans);
        result.put("byFactory", byFactory);

        List<Map<String, Object>> bottlenecks = detectCapacityBottlenecks(activeOrders, recentScans);
        result.put("bottlenecks", bottlenecks);

        List<String> recommendations = buildCapacityRecommendations(overview, bottlenecks);
        result.put("recommendations", recommendations);

        result.put("summary", buildCapacitySummary(overview, bottlenecks));
        return MAPPER.writeValueAsString(result);
    }

    private String workloadAnalysis() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<ProductionOrder> activeOrders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "completed", "cancelled", "scrapped", "archived", "closed")
                .isNotNull(ProductionOrder::getMerchandiser)
                .last("LIMIT 5000")
                .list();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);

        Map<String, Object> overview = buildWorkloadOverview(activeOrders);
        result.put("overview", overview);

        Map<String, Object> byMerchandiser = buildWorkloadByMerchandiser(activeOrders);
        result.put("byMerchandiser", byMerchandiser);

        List<Map<String, Object>> overloaded = detectOverloaded(activeOrders);
        result.put("overloadedMerchandisers", overloaded);

        List<String> recommendations = buildWorkloadRecommendations(overview, overloaded);
        result.put("recommendations", recommendations);

        result.put("summary", buildWorkloadSummary(overview, overloaded));
        return MAPPER.writeValueAsString(result);
    }

    private Map<String, Object> buildCapacityOverview(List<ProductionOrder> orders, List<ScanRecord> scans) {
        Map<String, Object> m = new LinkedHashMap<>();
        long totalOrders = orders.size();
        int totalQuantity = orders.stream()
                .mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)
                .sum();
        int completedQuantity = orders.stream()
                .mapToInt(o -> o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0)
                .sum();
        long totalScans7d = scans.size();
        int scans7dQty = scans.stream()
                .mapToInt(s -> s.getQuantity() != null ? s.getQuantity() : 0)
                .sum();
        double dailyAvgQty = totalScans7d > 0 ? scans7dQty / 7.0 : 0;

        m.put("activeOrders", totalOrders);
        m.put("totalOrderQuantity", totalQuantity);
        m.put("completedQuantity", completedQuantity);
        m.put("remainingQuantity", totalQuantity - completedQuantity);
        m.put("scans7d", totalScans7d);
        m.put("scanQuantity7d", scans7dQty);
        m.put("dailyAvgScanQty", BigDecimal.valueOf(dailyAvgQty).setScale(0, RoundingMode.HALF_UP));
        if (dailyAvgQty > 0 && totalQuantity > completedQuantity) {
            int remaining = totalQuantity - completedQuantity;
            int estimatedDays = (int) Math.ceil(remaining / dailyAvgQty);
            m.put("estimatedCompletionDays", estimatedDays);
            m.put("estimatedCompletionDate", LocalDate.now().plusDays(estimatedDays));
        }
        return m;
    }

    private Map<String, Object> buildCapacityByFactory(List<ProductionOrder> orders, List<ScanRecord> scans) {
        Map<String, Object> m = new LinkedHashMap<>();
        Map<String, List<ProductionOrder>> ordersByFactory = orders.stream()
                .filter(o -> o.getFactoryName() != null)
                .collect(Collectors.groupingBy(ProductionOrder::getFactoryName));
        Map<String, Object> factoryStats = new LinkedHashMap<>();
        ordersByFactory.forEach((factory, factoryOrders) -> {
            Map<String, Object> stat = new LinkedHashMap<>();
            stat.put("activeOrders", factoryOrders.size());
            int totalQty = factoryOrders.stream()
                    .mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
            int completedQty = factoryOrders.stream()
                    .mapToInt(o -> o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0).sum();
            stat.put("totalQuantity", totalQty);
            stat.put("completedQuantity", completedQty);
            stat.put("completionRate", totalQty > 0
                    ? BigDecimal.valueOf(completedQty * 100.0 / totalQty).setScale(1, RoundingMode.HALF_UP) + "%"
                    : "0%");
            factoryStats.put(factory, stat);
        });
        m.put("factories", factoryStats);
        return m;
    }

    private List<Map<String, Object>> detectCapacityBottlenecks(List<ProductionOrder> orders, List<ScanRecord> scans) {
        Map<String, List<ProductionOrder>> ordersByFactory = orders.stream()
                .filter(o -> o.getFactoryName() != null)
                .collect(Collectors.groupingBy(ProductionOrder::getFactoryName));
        return ordersByFactory.entrySet().stream()
                .filter(e -> {
                    int totalQty = e.getValue().stream()
                            .mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
                    int completedQty = e.getValue().stream()
                            .mapToInt(o -> o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0).sum();
                    double rate = totalQty > 0 ? completedQty * 100.0 / totalQty : 100;
                    return rate < 30 && e.getValue().size() >= 2;
                })
                .limit(5)
                .map(e -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("factory", e.getKey());
                    item.put("activeOrders", e.getValue().size());
                    int totalQty = e.getValue().stream()
                            .mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
                    int completedQty = e.getValue().stream()
                            .mapToInt(o -> o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0).sum();
                    item.put("completionRate", totalQty > 0
                            ? BigDecimal.valueOf(completedQty * 100.0 / totalQty).setScale(1, RoundingMode.HALF_UP) + "%"
                            : "0%");
                    item.put("suggestion", "完成率低于30%且订单≥2，建议关注产能瓶颈");
                    return item;
                }).toList();
    }

    private List<String> buildCapacityRecommendations(Map<String, Object> overview, List<Map<String, Object>> bottlenecks) {
        List<String> recs = new java.util.ArrayList<>();
        if (!bottlenecks.isEmpty()) {
            recs.add(bottlenecks.size() + "家工厂存在产能瓶颈，建议调整订单分配");
        }
        Integer estDays = (Integer) overview.get("estimatedCompletionDays");
        if (estDays != null && estDays > 30) {
            recs.add("按当前产能预计" + estDays + "天完成，建议增加产能或调整交期");
        }
        if (recs.isEmpty()) {
            recs.add("产能分配合理，各工厂负荷均衡");
        }
        return recs;
    }

    private String buildCapacitySummary(Map<String, Object> overview, List<Map<String, Object>> bottlenecks) {
        return "产能分析: " + overview.get("activeOrders") + "个活跃订单, 日均产出" + overview.get("dailyAvgScanQty") + "件, 瓶颈工厂" + bottlenecks.size() + "家";
    }

    private Map<String, Object> buildWorkloadOverview(List<ProductionOrder> orders) {
        Map<String, Object> m = new LinkedHashMap<>();
        long totalOrders = orders.size();
        long merchandiserCount = orders.stream()
                .filter(o -> o.getMerchandiser() != null)
                .map(ProductionOrder::getMerchandiser)
                .distinct().count();
        double avgOrdersPerPerson = merchandiserCount > 0 ? totalOrders * 1.0 / merchandiserCount : 0;
        m.put("totalActiveOrders", totalOrders);
        m.put("merchandiserCount", merchandiserCount);
        m.put("avgOrdersPerPerson", BigDecimal.valueOf(avgOrdersPerPerson).setScale(1, RoundingMode.HALF_UP));
        return m;
    }

    private Map<String, Object> buildWorkloadByMerchandiser(List<ProductionOrder> orders) {
        Map<String, Object> m = new LinkedHashMap<>();
        Map<String, List<ProductionOrder>> byPerson = orders.stream()
                .filter(o -> o.getMerchandiser() != null)
                .collect(Collectors.groupingBy(ProductionOrder::getMerchandiser));
        Map<String, Object> personStats = new LinkedHashMap<>();
        byPerson.forEach((person, personOrders) -> {
            Map<String, Object> stat = new LinkedHashMap<>();
            stat.put("activeOrders", personOrders.size());
            int totalQty = personOrders.stream()
                    .mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
            stat.put("totalQuantity", totalQty);
            personStats.put(person, stat);
        });
        m.put("merchandisers", personStats);
        return m;
    }

    private List<Map<String, Object>> detectOverloaded(List<ProductionOrder> orders) {
        Map<String, List<ProductionOrder>> byPerson = orders.stream()
                .filter(o -> o.getMerchandiser() != null)
                .collect(Collectors.groupingBy(ProductionOrder::getMerchandiser));
        double avgOrders = orders.size() * 1.0 / Math.max(byPerson.size(), 1);
        return byPerson.entrySet().stream()
                .filter(e -> e.getValue().size() > avgOrders * 1.5)
                .limit(5)
                .map(e -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("merchandiser", e.getKey());
                    item.put("activeOrders", e.getValue().size());
                    item.put("avgOrders", BigDecimal.valueOf(avgOrders).setScale(1, RoundingMode.HALF_UP));
                    item.put("overloadRatio", BigDecimal.valueOf(e.getValue().size() / avgOrders).setScale(1, RoundingMode.HALF_UP) + "x");
                    item.put("suggestion", "工作量超平均1.5倍，建议分担部分订单");
                    return item;
                }).toList();
    }

    private List<String> buildWorkloadRecommendations(Map<String, Object> overview, List<Map<String, Object>> overloaded) {
        List<String> recs = new java.util.ArrayList<>();
        if (!overloaded.isEmpty()) {
            recs.add(overloaded.size() + "位跟单员工作量超负荷，建议重新分配订单");
        }
        BigDecimal avg = (BigDecimal) overview.get("avgOrdersPerPerson");
        if (avg != null && avg.doubleValue() > 10) {
            recs.add("人均跟单" + avg + "单偏多，建议增加跟单人手");
        }
        if (recs.isEmpty()) {
            recs.add("工作量分配均衡，无过载情况");
        }
        return recs;
    }

    private String buildWorkloadSummary(Map<String, Object> overview, List<Map<String, Object>> overloaded) {
        return "工作量分析: " + overview.get("merchandiserCount") + "位跟单员, 人均" + overview.get("avgOrdersPerPerson") + "单, 过载" + overloaded.size() + "人";
    }
}
