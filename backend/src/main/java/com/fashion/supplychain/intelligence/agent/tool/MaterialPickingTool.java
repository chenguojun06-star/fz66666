package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.service.MaterialPickingService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 面料领料工具 — AI 可通过此工具查询、创建和管理面料领料单
 */
@Slf4j
@Component
public class MaterialPickingTool extends AbstractAgentTool {

    @Autowired
    private MaterialPickingService materialPickingService;

    @Autowired
    private AiAgentToolAccessService toolAccessService;

    @Override
    public String getName() {
        return "tool_material_picking";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp(
                "操作类型：list=查询领料单列表 / get_items=查询领料单明细 / create=创建领料单"));
        properties.put("pickingId", stringProp("领料单ID（get_items 时使用）"));
        properties.put("orderNo", stringProp("关联订单号（list/create 时可选）"));
        properties.put("styleNo", stringProp("款式编号（create 时可选）"));
        properties.put("orderId", stringProp("订单ID（create 时可选）"));
        properties.put("pickupType", stringProp("领取方式（create 时可选）：NORMAL=普通领取 / URGENT=紧急领取"));
        properties.put("remark", stringProp("备注（create 时可选）"));
        properties.put("materialName", stringProp("面料名称（create 时，描述所需面料）"));
        properties.put("quantity", intProp("领取数量（create 时）"));
        properties.put("unit", stringProp("单位，如 米/匹/kg（create 时可选）"));
        return buildToolDef(
                "管理面料领料单，包括查询领料单列表、查询领料明细、发起新的领料申请",
                properties,
                List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");

        return switch (action) {
            case "list" -> {
                TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
                String orderNo = optionalString(args, "orderNo");
                LambdaQueryWrapper<MaterialPicking> wrapper = new LambdaQueryWrapper<MaterialPicking>()
                        .eq(MaterialPicking::getTenantId, tenantId);
                if (orderNo != null) {
                    wrapper.eq(MaterialPicking::getOrderNo, orderNo);
                }
                wrapper.orderByDesc(MaterialPicking::getPickTime);
                List<MaterialPicking> list = materialPickingService.list(wrapper);
                yield successJson("查询领料单成功", Map.of("list", list, "total", list.size()));
            }
            case "get_items" -> {
                String pickingId = requireString(args, "pickingId");
                List<MaterialPickingItem> items = materialPickingService.getItemsByPickingId(pickingId);
                yield successJson("查询领料明细成功", Map.of("items", items, "total", items.size()));
            }
            case "create" -> {
                if (!toolAccessService.hasManagerAccess()) {
                    yield errorJson("创建领料单需要管理员权限");
                }
                String materialName = requireString(args, "materialName");
                Integer quantity = optionalInt(args, "quantity");
                String orderNo = optionalString(args, "orderNo");
                String orderId = optionalString(args, "orderId");
                String styleNo = optionalString(args, "styleNo");
                String pickupType = optionalString(args, "pickupType");
                String unit = optionalString(args, "unit");
                String remark = optionalString(args, "remark");

                String userId = UserContext.userId();
                TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

                MaterialPicking picking = new MaterialPicking();
                picking.setOrderId(orderId);
                picking.setOrderNo(orderNo);
                picking.setStyleNo(styleNo);
                picking.setPickerId(userId);
                picking.setPickupType(pickupType != null ? pickupType : "NORMAL");
                picking.setStatus("PENDING");
                picking.setRemark(remark);
                picking.setTenantId(tenantId);

                // 构建领料明细
                List<MaterialPickingItem> items = new ArrayList<>();
                if (quantity != null) {
                    MaterialPickingItem item = new MaterialPickingItem();
                    item.setMaterialName(materialName);
                    item.setQuantity(quantity);
                    item.setUnit(unit != null ? unit : "米");
                    item.setTenantId(tenantId);
                    items.add(item);
                }

                String pickingNo = materialPickingService.createPicking(picking, items);
                yield successJson("领料单创建成功", Map.of(
                        "pickingNo", pickingNo,
                        "materialName", materialName,
                        "quantity", quantity != null ? quantity : 0,
                        "message", "领料单已提交，请等待仓库确认"));
            }
            default -> errorJson("不支持的 action：" + action + "，可用：list / get_items / create");
        };
    }
}
