package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.procurement.orchestration.ProcurementOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 采购管理工具 — AI 可通过此工具查询、创建采购单并确认到货入库
 */
@Slf4j
@Component
public class ProcurementTool extends AbstractAgentTool {

    @Autowired
    private ProcurementOrchestrator procurementOrchestrator;

    @Override
    public String getName() {
        return "tool_procurement";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp(
                "操作类型：list=查询采购单列表 / detail=查采购单详情 / stats=采购统计 / create=创建采购单 / confirm_arrival=确认到货入库"));
        properties.put("page", intProp("页码，默认 1（list 时可选）"));
        properties.put("size", intProp("每页数量，默认 20（list 时可选）"));
        properties.put("keyword", stringProp("关键词搜索（list 时可选）"));
        properties.put("status", stringProp("状态筛选（list 时可选）"));
        properties.put("id", stringProp("采购单ID（detail/confirm_arrival 时使用）"));
        properties.put("materialName", stringProp("物料名称（create 时使用）"));
        properties.put("materialCode", stringProp("物料编码（create 时可选）"));
        properties.put("materialType", stringProp("物料类型（create 时可选）"));
        properties.put("specifications", stringProp("规格描述（create 时可选）"));
        properties.put("unit", stringProp("单位，如 米/kg/件（create 时可选）"));
        properties.put("purchaseQuantity", stringProp("采购数量，字符串格式的数值（create 时使用）"));
        properties.put("supplierName", stringProp("供应商名称（create 时可选）"));
        properties.put("unitPrice", stringProp("单价，字符串格式的数值（create 时可选）"));
        properties.put("orderNo", stringProp("关联订单号（create 时可选）"));
        properties.put("arrivedQuantity", intProp("到货数量（confirm_arrival 时使用）"));
        return buildToolDef(
                "管理采购全流程：查询采购单列表、查看详情、获取统计数据、创建新采购单、确认到货并入库",
                properties,
                List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");

        return switch (action) {
            case "list" -> {
                Map<String, Object> params = new HashMap<>();
                Integer page = optionalInt(args, "page");
                Integer size = optionalInt(args, "size");
                params.put("pageNum", page != null ? page : 1);
                params.put("pageSize", size != null ? size : 20);
                String keyword = optionalString(args, "keyword");
                String status = optionalString(args, "status");
                if (keyword != null) params.put("keyword", keyword);
                if (status != null) params.put("status", status);

                IPage<MaterialPurchase> pageResult = procurementOrchestrator.listPurchaseOrders(params);
                yield successJson("查询采购单成功", Map.of(
                        "list", pageResult.getRecords(),
                        "total", pageResult.getTotal(),
                        "page", pageResult.getCurrent(),
                        "pages", pageResult.getPages()));
            }
            case "detail" -> {
                String id = requireString(args, "id");
                MaterialPurchase detail = procurementOrchestrator.getPurchaseOrderDetail(id);
                if (detail == null) {
                    throw new IllegalStateException("采购单不存在：" + id);
                }
                yield successJson("查询采购单详情成功", Map.of("detail", detail));
            }
            case "stats" -> {
                Map<String, Object> statsResult = procurementOrchestrator.getStats(new HashMap<>());
                yield successJson("采购统计查询成功", statsResult);
            }
            case "create" -> {
                String materialName = requireString(args, "materialName");
                String purchaseQtyStr = requireString(args, "purchaseQuantity");

                MaterialPurchase purchase = new MaterialPurchase();
                purchase.setMaterialName(materialName);
                purchase.setPurchaseQuantity(new BigDecimal(purchaseQtyStr));

                String materialCode = optionalString(args, "materialCode");
                String materialType = optionalString(args, "materialType");
                String specifications = optionalString(args, "specifications");
                String unit = optionalString(args, "unit");
                String supplierName = optionalString(args, "supplierName");
                String unitPriceStr = optionalString(args, "unitPrice");
                String orderNo = optionalString(args, "orderNo");

                if (materialCode != null) purchase.setMaterialCode(materialCode);
                if (materialType != null) purchase.setMaterialType(materialType);
                if (specifications != null) purchase.setSpecifications(specifications);
                if (unit != null) purchase.setUnit(unit);
                if (supplierName != null) purchase.setSupplierName(supplierName);
                if (unitPriceStr != null) purchase.setUnitPrice(new BigDecimal(unitPriceStr));
                if (orderNo != null) purchase.setOrderNo(orderNo);

                boolean success = procurementOrchestrator.createPurchaseOrder(purchase);
                if (!success) {
                    throw new IllegalStateException("创建采购单失败，请检查参数");
                }
                yield successJson("采购单创建成功", Map.of(
                        "materialName", materialName,
                        "purchaseQuantity", purchaseQtyStr));
            }
            case "confirm_arrival" -> {
                String id = requireString(args, "id");
                Integer arrivedQty = optionalInt(args, "arrivedQuantity");

                Map<String, Object> params = new HashMap<>();
                params.put("id", id);
                if (arrivedQty != null) params.put("arrivedQuantity", arrivedQty);

                Map<String, Object> result = procurementOrchestrator.confirmArrivalAndInbound(params);
                yield successJson("到货确认入库成功", result);
            }
            default -> errorJson("不支持的 action：" + action + "，可用：list / detail / stats / create / confirm_arrival");
        };
    }
}
