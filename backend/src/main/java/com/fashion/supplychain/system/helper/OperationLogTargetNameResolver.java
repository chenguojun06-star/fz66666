package com.fashion.supplychain.system.helper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.entity.OperationLog;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Slf4j
@Component
@RequiredArgsConstructor
public class OperationLogTargetNameResolver {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final StyleInfoService styleInfoService;

    private final ProductionOrderService productionOrderService;

    private final MaterialPurchaseService materialPurchaseService;

    private final MaterialPickingService materialPickingService;

    private final CuttingTaskService cuttingTaskService;

    private final CuttingBundleService cuttingBundleService;

    private final ProductWarehousingService productWarehousingService;

    private final ProductOutstockService productOutstockService;

    public String resolveForStoredLog(OperationLog log) {
        if (log == null) {
            return null;
        }
        String detailName = extractFromDetails(log.getDetails());
        if (StringUtils.hasText(detailName)) {
            return detailName;
        }
        return resolveByTarget(log.getTargetType(), log.getTargetId());
    }

    public String resolveByTarget(String targetType, String targetId) {
        if (!StringUtils.hasText(targetId)) {
            return null;
        }
        try {
            if (matches(targetType, "订单")) {
                return formatOrder(productionOrderService == null ? null : productionOrderService.getById(targetId));
            }
            if (matches(targetType, "款式") || matches(targetType, "纸样/样衣")) {
                if (styleInfoService == null) {
                    return null;
                }
                var style = styleInfoService.getById(targetId);
                return style == null ? null : firstText(style.getStyleNo(), style.getStyleName());
            }
            if (matches(targetType, "采购单")) {
                return formatPurchase(materialPurchaseService == null ? null : materialPurchaseService.getById(targetId));
            }
            if (matches(targetType, "领料单")) {
                return formatPicking(materialPickingService == null ? null : materialPickingService.getById(targetId));
            }
            if (matches(targetType, "菲号")) {
                if (cuttingBundleService == null) {
                    return null;
                }
                var bundle = cuttingBundleService.getById(targetId);
                if (bundle == null) {
                    return null;
                }
                try {
                    Object value = bundle.getClass().getMethod("getBundleNo").invoke(bundle);
                    return value == null ? null : String.valueOf(value);
                } catch (Exception ignored) {
                    log.debug("[OpLogResolver] 反射获取bundleNo失败: targetId={}", targetId);
                    return null;
                }
            }
            if (matches(targetType, "裁剪单")) {
                return formatCuttingTask(cuttingTaskService == null ? null : cuttingTaskService.getById(targetId));
            }
            if (matches(targetType, "入库单") || matches(targetType, "仓库单")) {
                String warehousingName = formatWarehousing(productWarehousingService == null ? null : productWarehousingService.getById(targetId));
                if (StringUtils.hasText(warehousingName)) {
                    return warehousingName;
                }
                return formatOutstock(productOutstockService == null ? null : productOutstockService.getById(targetId));
            }
            if (matches(targetType, "出货单")) {
                return formatOutstock(productOutstockService == null ? null : productOutstockService.getById(targetId));
            }
        } catch (Exception ignored) {
            log.debug("[OpLogResolver] resolveTargetName失败: targetType={}", targetType);
            return null;
        }
        return null;
    }

    private String extractFromDetails(String details) {
        if (!StringUtils.hasText(details)) {
            return null;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> detailMap = OBJECT_MAPPER.readValue(details, Map.class);
            return extractFromMap(detailMap);
        } catch (Exception ignored) {
            log.debug("[OpLogResolver] extractFromDetails解析失败");
            return null;
        }
    }

    private String extractFromMap(Map<String, Object> map) {
        if (map == null || map.isEmpty()) {
            return null;
        }
        String orderNo = mapStr(map, "orderNo");
        String styleNo = mapStr(map, "styleNo");
        if (StringUtils.hasText(orderNo) && StringUtils.hasText(styleNo)) {
            return orderNo + " (" + styleNo + ")";
        }
        if (StringUtils.hasText(orderNo)) {
            return orderNo;
        }
        for (String key : new String[]{
                "warehousingNo", "outstockNo", "purchaseNo", "pickingNo", "cuttingBundleNo",
                "bundleNo", "cuttingNo", "materialName", "name", "code"
        }) {
            String value = mapStr(map, key);
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return styleNo;
    }

    private String formatOrder(ProductionOrder order) {
        if (order == null) {
            return null;
        }
        return joinOrderAndStyle(order.getOrderNo(), order.getStyleNo());
    }

    private String formatPurchase(MaterialPurchase purchase) {
        if (purchase == null) {
            return null;
        }
        String purchaseNo = purchase.getPurchaseNo();
        String materialName = purchase.getMaterialName();
        if (StringUtils.hasText(purchaseNo) && StringUtils.hasText(materialName)) {
            return purchaseNo + " [" + materialName + "]";
        }
        return firstText(purchaseNo, materialName);
    }

    private String formatPicking(MaterialPicking picking) {
        if (picking == null) {
            return null;
        }
        return firstText(picking.getPickingNo(), picking.getOrderNo(), picking.getStyleNo());
    }

    private String formatCuttingTask(CuttingTask task) {
        if (task == null) {
            return null;
        }
        return joinOrderAndStyle(task.getProductionOrderNo(), task.getStyleNo());
    }

    private String formatWarehousing(ProductWarehousing warehousing) {
        if (warehousing == null) {
            return null;
        }
        String orderAndStyle = joinOrderAndStyle(warehousing.getOrderNo(), warehousing.getStyleNo());
        if (StringUtils.hasText(warehousing.getWarehousingNo()) && StringUtils.hasText(orderAndStyle)) {
            return warehousing.getWarehousingNo() + " (" + orderAndStyle + ")";
        }
        return firstText(warehousing.getWarehousingNo(), orderAndStyle);
    }

    private String formatOutstock(ProductOutstock outstock) {
        if (outstock == null) {
            return null;
        }
        String orderAndStyle = joinOrderAndStyle(outstock.getOrderNo(), outstock.getStyleNo());
        if (StringUtils.hasText(outstock.getOutstockNo()) && StringUtils.hasText(orderAndStyle)) {
            return outstock.getOutstockNo() + " (" + orderAndStyle + ")";
        }
        return firstText(outstock.getOutstockNo(), orderAndStyle);
    }

    private String joinOrderAndStyle(String orderNo, String styleNo) {
        if (StringUtils.hasText(orderNo) && StringUtils.hasText(styleNo)) {
            return orderNo + " (" + styleNo + ")";
        }
        return firstText(orderNo, styleNo);
    }

    private String firstText(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    private String mapStr(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() || "null".equalsIgnoreCase(text) ? null : text;
    }

    private boolean matches(String targetType, String expected) {
        return StringUtils.hasText(targetType) && expected.equals(targetType.trim());
    }
}
