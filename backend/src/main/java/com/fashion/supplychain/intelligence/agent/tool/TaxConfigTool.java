package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.TaxConfig;
import com.fashion.supplychain.finance.service.TaxConfigService;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class TaxConfigTool extends AbstractAgentTool {

    @Autowired
    private TaxConfigService taxConfigService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: list_tax | active_tax | calc_tax"));
        properties.put("amount", stringProp("计算税费的金额(calc_tax时)"));
        properties.put("taxCode", stringProp("税率编码(calc_tax时)"));
        return buildToolDef(
                "税务配置查询：查看税率列表、当前生效税率、计算税费。用户说「税率」「税费」「税务」「计算税费」时必须调用。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "tool_tax_config";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.FINANCE;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (UserContext.factoryId() != null) {
            return errorJson("外发工厂账号无权访问税务配置");
        }
        return switch (action) {
            case "list_tax" -> listTax();
            case "active_tax" -> activeTax();
            case "calc_tax" -> calcTax(args);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String listTax() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<TaxConfig> items = taxConfigService.lambdaQuery()
                .eq(TaxConfig::getTenantId, tenantId)
                .orderByAsc(TaxConfig::getTaxCode)
                .last("LIMIT 50")
                .list();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "税率配置共 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String activeTax() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        java.time.LocalDate today = java.time.LocalDate.now();
        List<TaxConfig> items = taxConfigService.lambdaQuery()
                .eq(TaxConfig::getTenantId, tenantId)
                .eq(TaxConfig::getStatus, "active")
                .le(TaxConfig::getEffectiveDate, today)
                .ge(TaxConfig::getExpiryDate, today)
                .list();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "当前生效税率 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String calcTax(Map<String, Object> args) throws Exception {
        String amountStr = optionalString(args, "amount");
        String taxCode = optionalString(args, "taxCode");
        if (amountStr == null || taxCode == null) {
            return errorJson("calc_tax 需要 amount 和 taxCode 参数");
        }
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        BigDecimal amount = new BigDecimal(amountStr);
        TaxConfig tax = taxConfigService.lambdaQuery()
                .eq(TaxConfig::getTenantId, tenantId)
                .eq(TaxConfig::getTaxCode, taxCode)
                .eq(TaxConfig::getStatus, "active")
                .one();
        if (tax == null) return errorJson("未找到税率配置: " + taxCode);
        BigDecimal taxAmount = amount.multiply(tax.getTaxRate()).divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
        BigDecimal totalAmount = amount.add(taxAmount);
        return successJson("税费计算完成", Map.of(
                "amount", amount, "taxRate", tax.getTaxRate(),
                "taxAmount", taxAmount, "totalAmount", totalAmount,
                "taxName", tax.getTaxName()));
    }

    private Map<String, Object> toDto(TaxConfig t) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", t.getId());
        dto.put("taxName", t.getTaxName());
        dto.put("taxCode", t.getTaxCode());
        dto.put("taxRate", t.getTaxRate());
        dto.put("isDefault", t.getIsDefault());
        dto.put("effectiveDate", t.getEffectiveDate());
        dto.put("expiryDate", t.getExpiryDate());
        dto.put("status", t.getStatus());
        dto.put("description", t.getDescription());
        return dto;
    }
}
