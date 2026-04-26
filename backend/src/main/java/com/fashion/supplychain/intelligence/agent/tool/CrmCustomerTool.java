package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.service.CustomerService;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
public class CrmCustomerTool extends AbstractAgentTool {

    @Autowired
    private CustomerService customerService;
    @Autowired
    private AiAgentToolAccessService toolAccessService;

    @Override
    public String getName() {
        return "tool_query_crm_customer";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.FINANCE;
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: list_customer | get_customer | analyze_customer | value_analysis"));
        properties.put("companyName", stringProp("客户公司名称关键词"));
        properties.put("customerLevel", stringProp("客户级别: A / B / C / D"));
        properties.put("contactPerson", stringProp("联系人名字"));
        properties.put("customerId", stringProp("客户ID"));
        return buildToolDef(
                "CRM客户智能管理：查询客户列表、详情、客户分析（级别分布/行业分布）、客户价值分析。用户说「客户」「客户分析」「客户价值」时必须调用。",
                properties, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (UserContext.factoryId() != null) {
            return errorJson("外发工厂账号无权访问客户数据");
        }
        return switch (action) {
            case "list_customer" -> listCustomer(args);
            case "get_customer" -> getCustomer(args);
            case "analyze_customer" -> analyzeCustomer();
            case "value_analysis" -> valueAnalysis();
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String listCustomer(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String companyName = optionalString(args, "companyName");
        String customerLevel = optionalString(args, "customerLevel");
        String contactPerson = optionalString(args, "contactPerson");

        LambdaQueryWrapper<Customer> query = new LambdaQueryWrapper<Customer>()
                .eq(Customer::getTenantId, tenantId)
                .eq(Customer::getDeleteFlag, 0)
                .like(companyName != null, Customer::getCompanyName, companyName)
                .eq(customerLevel != null, Customer::getCustomerLevel, customerLevel)
                .like(contactPerson != null, Customer::getContactPerson, contactPerson)
                .orderByDesc(Customer::getCreateTime)
                .last("LIMIT 50");
        List<Customer> customers = customerService.list(query);
        return successJson("查询客户成功", Map.of("items", customers.stream().map(this::toListDto).toList(), "total", customers.size()));
    }

    private String getCustomer(Map<String, Object> args) throws Exception {
        String customerId = requireString(args, "customerId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Customer customer = customerService.lambdaQuery()
                .eq(Customer::getId, customerId)
                .eq(Customer::getTenantId, tenantId)
                .eq(Customer::getDeleteFlag, 0)
                .one();
        if (customer == null) return errorJson("客户不存在");
        return successJson("查询成功", Map.of("customer", toDetailDto(customer)));
    }

    private String analyzeCustomer() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<Customer> all = customerService.lambdaQuery()
                .eq(Customer::getTenantId, tenantId)
                .eq(Customer::getDeleteFlag, 0)
                .last("LIMIT 5000")
                .list();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);

        Map<String, Object> overview = buildCustomerOverview(all);
        result.put("overview", overview);

        Map<String, Object> levelDistribution = buildLevelDistribution(all);
        result.put("levelDistribution", levelDistribution);

        Map<String, Object> industryDistribution = buildIndustryDistribution(all);
        result.put("industryDistribution", industryDistribution);

        List<Map<String, Object>> churnRisk = detectChurnRisk(all);
        result.put("churnRiskCustomers", churnRisk);

        List<String> recommendations = buildCustomerRecommendations(overview, churnRisk);
        result.put("recommendations", recommendations);

        result.put("summary", buildCustomerSummary(overview, churnRisk));
        return MAPPER.writeValueAsString(result);
    }

    private String valueAnalysis() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<Customer> all = customerService.lambdaQuery()
                .eq(Customer::getTenantId, tenantId)
                .eq(Customer::getDeleteFlag, 0)
                .last("LIMIT 5000")
                .list();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);

        Map<String, Object> valueOverview = buildValueOverview(all);
        result.put("valueOverview", valueOverview);

        List<Map<String, Object>> highValue = identifyHighValueCustomers(all);
        result.put("highValueCustomers", highValue);

        List<Map<String, Object>> growthPotential = identifyGrowthPotential(all);
        result.put("growthPotentialCustomers", growthPotential);

        List<String> suggestions = buildValueSuggestions(valueOverview, highValue, growthPotential);
        result.put("suggestions", suggestions);

        result.put("summary", buildValueSummary(valueOverview, highValue, growthPotential));
        return MAPPER.writeValueAsString(result);
    }

    private Map<String, Object> buildCustomerOverview(List<Customer> all) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("totalCustomers", all.size());
        long withLevel = all.stream().filter(c -> c.getCustomerLevel() != null).count();
        long withIndustry = all.stream().filter(c -> c.getIndustry() != null).count();
        m.put("withLevelInfo", withLevel);
        m.put("withIndustryInfo", withIndustry);
        if (all.size() > 0) {
            m.put("levelCoverage", BigDecimal.valueOf(withLevel * 100.0 / all.size()).setScale(1, RoundingMode.HALF_UP) + "%");
        }
        return m;
    }

    private Map<String, Object> buildLevelDistribution(List<Customer> all) {
        Map<String, Object> m = new LinkedHashMap<>();
        Map<String, Long> byLevel = all.stream()
                .filter(c -> c.getCustomerLevel() != null)
                .collect(Collectors.groupingBy(Customer::getCustomerLevel, Collectors.counting()));
        m.put("countByLevel", byLevel);
        long aLevel = byLevel.getOrDefault("A", 0L);
        long bLevel = byLevel.getOrDefault("B", 0L);
        if (!byLevel.isEmpty()) {
            m.put("abRate", BigDecimal.valueOf((aLevel + bLevel) * 100.0 / all.size()).setScale(1, RoundingMode.HALF_UP) + "%");
        }
        return m;
    }

    private Map<String, Object> buildIndustryDistribution(List<Customer> all) {
        Map<String, Object> m = new LinkedHashMap<>();
        Map<String, Long> byIndustry = all.stream()
                .filter(c -> c.getIndustry() != null)
                .collect(Collectors.groupingBy(Customer::getIndustry, Collectors.counting()));
        m.put("countByIndustry", byIndustry);
        return m;
    }

    private List<Map<String, Object>> detectChurnRisk(List<Customer> all) {
        return all.stream()
                .filter(c -> "D".equals(c.getCustomerLevel()))
                .limit(10)
                .map(c -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("customerId", c.getId());
                    item.put("companyName", c.getCompanyName());
                    item.put("customerLevel", c.getCustomerLevel());
                    item.put("contactPerson", c.getContactPerson());
                    item.put("riskType", "D级客户");
                    item.put("suggestion", "D级客户存在流失风险，建议主动联系维护关系");
                    return item;
                }).toList();
    }

    private Map<String, Object> buildValueOverview(List<Customer> all) {
        Map<String, Object> m = new LinkedHashMap<>();
        long aCount = all.stream().filter(c -> "A".equals(c.getCustomerLevel())).count();
        long bCount = all.stream().filter(c -> "B".equals(c.getCustomerLevel())).count();
        long cCount = all.stream().filter(c -> "C".equals(c.getCustomerLevel())).count();
        long dCount = all.stream().filter(c -> "D".equals(c.getCustomerLevel())).count();
        m.put("aLevelCount", aCount);
        m.put("bLevelCount", bCount);
        m.put("cLevelCount", cCount);
        m.put("dLevelCount", dCount);
        if (all.size() > 0) {
            m.put("highValueRate", BigDecimal.valueOf((aCount + bCount) * 100.0 / all.size()).setScale(1, RoundingMode.HALF_UP) + "%");
        }
        return m;
    }

    private List<Map<String, Object>> identifyHighValueCustomers(List<Customer> all) {
        return all.stream()
                .filter(c -> "A".equals(c.getCustomerLevel()) || "B".equals(c.getCustomerLevel()))
                .limit(10)
                .map(c -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("customerId", c.getId());
                    item.put("companyName", c.getCompanyName());
                    item.put("customerLevel", c.getCustomerLevel());
                    item.put("contactPerson", c.getContactPerson());
                    item.put("industry", c.getIndustry());
                    item.put("valueTag", "A".equals(c.getCustomerLevel()) ? "核心客户" : "重要客户");
                    return item;
                }).toList();
    }

    private List<Map<String, Object>> identifyGrowthPotential(List<Customer> all) {
        return all.stream()
                .filter(c -> "C".equals(c.getCustomerLevel()))
                .limit(10)
                .map(c -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("customerId", c.getId());
                    item.put("companyName", c.getCompanyName());
                    item.put("customerLevel", c.getCustomerLevel());
                    item.put("contactPerson", c.getContactPerson());
                    item.put("industry", c.getIndustry());
                    item.put("potentialTag", "成长型客户");
                    item.put("suggestion", "C级客户有升级潜力，建议加强服务争取升级");
                    return item;
                }).toList();
    }

    private List<String> buildCustomerRecommendations(Map<String, Object> overview, List<Map<String, Object>> churnRisk) {
        List<String> recs = new java.util.ArrayList<>();
        if (!churnRisk.isEmpty()) {
            recs.add(churnRisk.size() + "个D级客户存在流失风险，建议制定挽留计划");
        }
        long total = (long) overview.getOrDefault("totalCustomers", 0L);
        long withLevel = (long) overview.getOrDefault("withLevelInfo", 0L);
        if (total > 0 && withLevel * 100.0 / total < 80) {
            recs.add("客户级别覆盖率不足80%，建议完善客户评级");
        }
        if (recs.isEmpty()) {
            recs.add("客户管理状态良好");
        }
        return recs;
    }

    private List<String> buildValueSuggestions(Map<String, Object> valueOverview,
                                                List<Map<String, Object>> highValue,
                                                List<Map<String, Object>> growthPotential) {
        List<String> suggestions = new java.util.ArrayList<>();
        long aCount = (long) valueOverview.getOrDefault("aLevelCount", 0L);
        if (aCount > 0) {
            suggestions.add(aCount + "个A级核心客户，建议定期回访维护关系");
        }
        if (!growthPotential.isEmpty()) {
            suggestions.add(growthPotential.size() + "个C级成长型客户，建议重点培育争取升级");
        }
        long dCount = (long) valueOverview.getOrDefault("dLevelCount", 0L);
        if (dCount > 0) {
            suggestions.add(dCount + "个D级客户，建议评估是否值得继续投入资源");
        }
        if (suggestions.isEmpty()) {
            suggestions.add("客户价值分布合理");
        }
        return suggestions;
    }

    private String buildCustomerSummary(Map<String, Object> overview, List<Map<String, Object>> churnRisk) {
        return "客户分析: 共" + overview.get("totalCustomers") + "个客户, 流失风险" + churnRisk.size() + "个";
    }

    private String buildValueSummary(Map<String, Object> valueOverview,
                                      List<Map<String, Object>> highValue,
                                      List<Map<String, Object>> growthPotential) {
        return "客户价值分析: A级" + valueOverview.get("aLevelCount") + "个, B级" + valueOverview.get("bLevelCount")
                + "个, 核心客户" + highValue.size() + "个, 成长型" + growthPotential.size() + "个";
    }

    private Map<String, Object> toListDto(Customer c) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", c.getId());
        dto.put("customerNo", c.getCustomerNo());
        dto.put("companyName", c.getCompanyName());
        dto.put("customerLevel", c.getCustomerLevel());
        dto.put("contactPerson", c.getContactPerson());
        dto.put("contactPhone", c.getContactPhone());
        dto.put("industry", c.getIndustry());
        dto.put("remark", c.getRemark());
        return dto;
    }

    private Map<String, Object> toDetailDto(Customer c) {
        Map<String, Object> dto = toListDto(c);
        dto.put("contactEmail", c.getContactEmail());
        dto.put("address", c.getAddress());
        dto.put("source", c.getSource());
        dto.put("status", c.getStatus());
        dto.put("creatorName", c.getCreatorName());
        return dto;
    }
}
