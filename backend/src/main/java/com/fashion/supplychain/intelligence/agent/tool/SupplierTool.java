package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class SupplierTool extends AbstractAgentTool {

    @Autowired
    private FactoryService factoryService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: list_supplier | get_supplier"));
        properties.put("keyword", stringProp("按供应商名/联系人模糊过滤"));
        properties.put("factoryType", stringProp("类型过滤: INTERNAL / EXTERNAL"));
        properties.put("limit", intProp("列表条数，默认10"));
        properties.put("supplierId", stringProp("供应商/工厂ID"));
        return buildToolDef(
                "供应商查询：查看供应商列表、供应商详情(复用工厂实体)。用户说'供应商''供应商列表''找供应商'时必须调用。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "tool_supplier";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.WAREHOUSE;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        return switch (action) {
            case "list_supplier" -> listSuppliers(args);
            case "get_supplier" -> getSupplier(args);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String listSuppliers(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String keyword = optionalString(args, "keyword");
        String factoryType = optionalString(args, "factoryType");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 10;

        LambdaQueryWrapper<Factory> query = new LambdaQueryWrapper<Factory>()
                .eq(Factory::getTenantId, tenantId)
                .eq(Factory::getDeleteFlag, 0)
                .eq(StringUtils.hasText(factoryType), Factory::getFactoryType, factoryType)
                .and(StringUtils.hasText(keyword), q -> q
                        .like(Factory::getFactoryName, keyword)
                        .or().like(Factory::getContactPerson, keyword))
                .orderByDesc(Factory::getCreateTime)
                .last("LIMIT " + limit);

        List<Factory> items = factoryService.list(query);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "供应商共命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toListDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String getSupplier(Map<String, Object> args) throws Exception {
        String supplierId = requireString(args, "supplierId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Factory factory = factoryService.lambdaQuery()
                .eq(Factory::getId, supplierId)
                .eq(Factory::getTenantId, tenantId)
                .eq(Factory::getDeleteFlag, 0)
                .one();
        if (factory == null) return errorJson("供应商不存在或无权访问");
        return successJson("查询成功", Map.of("supplier", toDetailDto(factory)));
    }

    private Map<String, Object> toListDto(Factory f) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", f.getId());
        dto.put("factoryName", f.getFactoryName());
        dto.put("factoryType", f.getFactoryType());
        dto.put("contactPerson", f.getContactPerson());
        dto.put("contactPhone", f.getContactPhone());
        dto.put("address", f.getAddress());
        dto.put("status", f.getStatus());
        return dto;
    }

    private Map<String, Object> toDetailDto(Factory f) {
        Map<String, Object> dto = toListDto(f);
        dto.put("supplierCategory", f.getSupplierCategory());
        dto.put("supplierRegion", f.getSupplierRegion());
        dto.put("supplierTier", f.getSupplierTier());
        dto.put("operationRemark", f.getOperationRemark());
        dto.put("createTime", f.getCreateTime());
        return dto;
    }
}
