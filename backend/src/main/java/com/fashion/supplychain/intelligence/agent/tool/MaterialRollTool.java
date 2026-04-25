package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.MaterialRoll;
import com.fashion.supplychain.production.service.MaterialRollService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class MaterialRollTool extends AbstractAgentTool {

    @Autowired
    private MaterialRollService materialRollService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: list_roll | get_roll | scan_roll"));
        properties.put("inboundId", stringProp("入库单ID(按入库单查物料卷)"));
        properties.put("rollCode", stringProp("物料卷码(精确查询/扫码)"));
        properties.put("materialName", stringProp("按物料名模糊过滤"));
        properties.put("status", stringProp("状态过滤: in_stock / issued / consumed"));
        properties.put("limit", intProp("列表条数，默认20"));
        return buildToolDef(
                "物料卷管理：查看物料卷列表、物料卷详情、物料卷扫码。用户说「物料卷」「卷号」「面料卷」「扫码物料卷」时必须调用。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "tool_material_roll";
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
            case "list_roll" -> listRolls(args);
            case "get_roll" -> getRoll(args);
            case "scan_roll" -> scanRoll(args);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String listRolls(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String inboundId = optionalString(args, "inboundId");
        String materialName = optionalString(args, "materialName");
        String status = optionalString(args, "status");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 20;

        LambdaQueryWrapper<MaterialRoll> query = new LambdaQueryWrapper<MaterialRoll>()
                .eq(MaterialRoll::getTenantId, tenantId)
                .eq(StringUtils.hasText(inboundId), MaterialRoll::getInboundId, inboundId)
                .eq(StringUtils.hasText(status), MaterialRoll::getStatus, status)
                .like(StringUtils.hasText(materialName), MaterialRoll::getMaterialName, materialName)
                .orderByDesc(MaterialRoll::getCreateTime)
                .last("LIMIT " + limit);

        List<MaterialRoll> items = materialRollService.list(query);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "物料卷共命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toListDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String getRoll(Map<String, Object> args) throws Exception {
        String rollCode = requireString(args, "rollCode");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        MaterialRoll roll = materialRollService.lambdaQuery()
                .eq(MaterialRoll::getRollCode, rollCode)
                .eq(MaterialRoll::getTenantId, tenantId)
                .one();
        if (roll == null) return errorJson("物料卷不存在或无权访问");
        return successJson("查询成功", Map.of("roll", toDetailDto(roll)));
    }

    private String scanRoll(Map<String, Object> args) throws Exception {
        String rollCode = requireString(args, "rollCode");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        MaterialRoll roll = materialRollService.findByRollCode(rollCode);
        if (roll == null || !tenantId.equals(roll.getTenantId())) {
            return errorJson("物料卷不存在或无权访问");
        }
        return successJson("扫码成功", Map.of("roll", toDetailDto(roll)));
    }

    private Map<String, Object> toListDto(MaterialRoll r) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", r.getId());
        dto.put("rollCode", r.getRollCode());
        dto.put("materialCode", r.getMaterialCode());
        dto.put("materialName", r.getMaterialName());
        dto.put("materialType", r.getMaterialType());
        dto.put("color", r.getColor());
        dto.put("quantity", r.getQuantity());
        dto.put("unit", r.getUnit());
        dto.put("status", r.getStatus());
        dto.put("warehouseLocation", r.getWarehouseLocation());
        dto.put("supplierName", r.getSupplierName());
        return dto;
    }

    private Map<String, Object> toDetailDto(MaterialRoll r) {
        Map<String, Object> dto = toListDto(r);
        dto.put("inboundId", r.getInboundId());
        dto.put("inboundNo", r.getInboundNo());
        dto.put("specifications", r.getSpecifications());
        dto.put("issuedOrderId", r.getIssuedOrderId());
        dto.put("issuedOrderNo", r.getIssuedOrderNo());
        dto.put("issuedTime", r.getIssuedTime());
        dto.put("issuedByName", r.getIssuedByName());
        dto.put("remark", r.getRemark());
        dto.put("createTime", r.getCreateTime());
        return dto;
    }
}
