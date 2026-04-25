package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.warehouse.entity.InventoryCheck;
import com.fashion.supplychain.warehouse.service.InventoryCheckService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class InventoryCheckTool extends AbstractAgentTool {

    @Autowired
    private InventoryCheckService inventoryCheckService;
    @Autowired
    private AiAgentToolAccessService toolAccessService;

    private static final java.util.Set<String> WRITE_ACTIONS = java.util.Set.of(
            "create_check", "confirm_check", "cancel_check");

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: list_check | get_check | stats_check | create_check | confirm_check | cancel_check"));
        properties.put("checkId", stringProp("盘点ID"));
        properties.put("checkType", stringProp("盘点类型: material / finished_product"));
        properties.put("status", stringProp("状态过滤: draft / in_progress / confirmed / cancelled"));
        properties.put("limit", intProp("列表条数，默认10"));
        properties.put("warehouseLocation", stringProp("仓库位置(create时)"));
        properties.put("remark", stringProp("备注"));
        return buildToolDef(
                "盘点管理：查看盘点记录、盘点统计、创建盘点、确认/取消盘点。用户说「盘点」「库存盘点」「盘点记录」时必须调用。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "tool_inventory_check";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.WAREHOUSE;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (WRITE_ACTIONS.contains(action) && !toolAccessService.hasManagerAccess()) {
            return errorJson("盘点写操作需要管理员权限");
        }
        if (UserContext.factoryId() != null) {
            return errorJson("外发工厂账号无权访问盘点数据");
        }
        return switch (action) {
            case "list_check" -> listChecks(args);
            case "get_check" -> getCheck(args);
            case "stats_check" -> statsChecks();
            case "create_check" -> createCheck(args);
            case "confirm_check" -> confirmCheck(args);
            case "cancel_check" -> cancelCheck(args);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String listChecks(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String checkType = optionalString(args, "checkType");
        String status = optionalString(args, "status");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 10;

        LambdaQueryWrapper<InventoryCheck> query = new LambdaQueryWrapper<InventoryCheck>()
                .eq(InventoryCheck::getTenantId, tenantId)
                .eq(InventoryCheck::getDeleteFlag, 0)
                .eq(StringUtils.hasText(checkType), InventoryCheck::getCheckType, checkType)
                .eq(StringUtils.hasText(status), InventoryCheck::getStatus, status)
                .orderByDesc(InventoryCheck::getCreateTime)
                .last("LIMIT " + limit);

        List<InventoryCheck> items = inventoryCheckService.list(query);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "盘点共命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toListDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String getCheck(Map<String, Object> args) throws Exception {
        String checkId = requireString(args, "checkId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        InventoryCheck check = inventoryCheckService.lambdaQuery()
                .eq(InventoryCheck::getId, checkId)
                .eq(InventoryCheck::getTenantId, tenantId)
                .eq(InventoryCheck::getDeleteFlag, 0)
                .one();
        if (check == null) return errorJson("盘点不存在或无权访问");
        return successJson("查询成功", Map.of("check", toDetailDto(check)));
    }

    private String statsChecks() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<InventoryCheck> all = inventoryCheckService.lambdaQuery()
                .eq(InventoryCheck::getTenantId, tenantId)
                .eq(InventoryCheck::getDeleteFlag, 0)
                .list();
        long total = all.size();
        long confirmed = all.stream().filter(c -> "confirmed".equals(c.getStatus())).count();
        long inProgress = all.stream().filter(c -> "in_progress".equals(c.getStatus())).count();
        BigDecimal totalDiffAmount = all.stream()
                .map(InventoryCheck::getTotalDiffAmount)
                .filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "盘点统计: 共" + total + "次, 进行中" + inProgress + "次, 已确认" + confirmed + "次, 差异金额" + totalDiffAmount);
        result.put("total", total);
        result.put("confirmed", confirmed);
        result.put("inProgress", inProgress);
        result.put("totalDiffAmount", totalDiffAmount);
        return MAPPER.writeValueAsString(result);
    }

    private String createCheck(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        InventoryCheck check = new InventoryCheck();
        check.setTenantId(tenantId);
        check.setCheckType(optionalString(args, "checkType"));
        check.setWarehouseLocation(optionalString(args, "warehouseLocation"));
        check.setStatus("draft");
        check.setRemark(optionalString(args, "remark"));
        check.setCreatedById(String.valueOf(UserContext.userId()));
        check.setCreatedByName(UserContext.username());
        inventoryCheckService.save(check);
        return successJson("盘点创建成功", Map.of("checkId", check.getId()));
    }

    private String confirmCheck(Map<String, Object> args) throws Exception {
        String checkId = requireString(args, "checkId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        InventoryCheck check = inventoryCheckService.lambdaQuery()
                .eq(InventoryCheck::getId, checkId)
                .eq(InventoryCheck::getTenantId, tenantId)
                .eq(InventoryCheck::getDeleteFlag, 0)
                .one();
        if (check == null) return errorJson("盘点不存在");
        check.setStatus("confirmed");
        check.setConfirmedBy(String.valueOf(UserContext.userId()));
        check.setConfirmedName(UserContext.username());
        check.setConfirmedTime(java.time.LocalDateTime.now());
        inventoryCheckService.updateById(check);
        return successJson("盘点已确认", Map.of("checkId", checkId));
    }

    private String cancelCheck(Map<String, Object> args) throws Exception {
        String checkId = requireString(args, "checkId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        InventoryCheck check = inventoryCheckService.lambdaQuery()
                .eq(InventoryCheck::getId, checkId)
                .eq(InventoryCheck::getTenantId, tenantId)
                .eq(InventoryCheck::getDeleteFlag, 0)
                .one();
        if (check == null) return errorJson("盘点不存在");
        if ("confirmed".equals(check.getStatus())) return errorJson("已确认的盘点不可取消");
        check.setStatus("cancelled");
        inventoryCheckService.updateById(check);
        return successJson("盘点已取消", Map.of("checkId", checkId));
    }

    private Map<String, Object> toListDto(InventoryCheck c) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", c.getId());
        dto.put("checkNo", c.getCheckNo());
        dto.put("checkType", c.getCheckType());
        dto.put("status", c.getStatus());
        dto.put("checkDate", c.getCheckDate());
        dto.put("warehouseLocation", c.getWarehouseLocation());
        dto.put("totalItems", c.getTotalItems());
        dto.put("diffItems", c.getDiffItems());
        dto.put("totalDiffQty", c.getTotalDiffQty());
        dto.put("totalDiffAmount", c.getTotalDiffAmount());
        dto.put("createTime", c.getCreateTime());
        return dto;
    }

    private Map<String, Object> toDetailDto(InventoryCheck c) {
        Map<String, Object> dto = toListDto(c);
        dto.put("totalBookQty", c.getTotalBookQty());
        dto.put("totalActualQty", c.getTotalActualQty());
        dto.put("remark", c.getRemark());
        dto.put("confirmedName", c.getConfirmedName());
        dto.put("confirmedTime", c.getConfirmedTime());
        dto.put("createdByName", c.getCreatedByName());
        return dto;
    }
}
