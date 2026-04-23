package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.Map;

/**
 * 工序单价解析器
 * 职责：从模板库解析工序单价，支持多种匹配方式
 *
 * 权限控制：
 * - 外发工厂员工：不返回单价，扫码只显示工序
 * - 外发工厂老板：可以看到外发价格
 * - 内部工厂：正常显示单价
 */
@Component
@Slf4j
public class UnitPriceResolver {

    private static final String[] FIXED_PRODUCTION_NODES = {
            "采购", "裁剪", "二次工艺", "车缝", "尾部", "入库"
    };

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    /**
     * 解析工序单价（公开接口）
     * 
     * 权限控制：
     * - 外发工厂员工（isWorker + factoryId）：不返回单价
     * - 外发工厂老板（isSupervisorOrAbove + factoryId）：返回外发锁定价格
     * - 内部工厂：正常返回模板价格
     */
    public Map<String, Object> resolveUnitPrice(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : new HashMap<>(params);

        String scanCode = TextUtils.safeText(safeParams.get("scanCode"));
        String orderId = TextUtils.safeText(safeParams.get("orderId"));
        String orderNo = TextUtils.safeText(safeParams.get("orderNo"));
        String styleNo = TextUtils.safeText(safeParams.get("styleNo"));

        CuttingBundle bundle = hasText(scanCode) ? cuttingBundleService.getByQrCode(scanCode) : null;
        if (!hasText(orderId) && bundle != null && hasText(bundle.getProductionOrderId())) {
            orderId = bundle.getProductionOrderId().trim();
        }

        ProductionOrder order = null;
        if (!hasText(styleNo) || !hasText(orderId)) {
            order = resolveOrder(orderId, orderNo);
            if (order != null) {
                if (!hasText(styleNo)) {
                    styleNo = TextUtils.safeText(order.getStyleNo());
                }
                if (!hasText(orderId)) {
                    orderId = TextUtils.safeText(order.getId());
                }
            }
        }
        if (!hasText(styleNo)) {
            throw new IllegalArgumentException("未匹配到款号");
        }

        String processName = TextUtils.safeText(safeParams.get("processName"));
        if (!hasText(processName)) {
            processName = TextUtils.safeText(safeParams.get("progressStage"));
        }
        if (!hasText(processName)) {
            throw new IllegalArgumentException("缺少工序名称");
        }

        if (order == null && hasText(orderId)) {
            order = productionOrderService.getById(orderId);
        }

        boolean isExternalOrder = order != null && "EXTERNAL".equals(order.getFactoryType());
        String currentFactoryId = UserContext.factoryId();
        boolean isExternalFactoryUser = hasText(currentFactoryId);
        boolean isExternalFactoryWorker = isExternalFactoryUser && UserContext.isWorker();
        boolean isExternalFactoryAdmin = isExternalFactoryUser && UserContext.isSupervisorOrAbove();

        BigDecimal unitPrice = null;
        String priceSource = null;
        String unitPriceHint = null;
        boolean hidePrice = false;

        if (isExternalFactoryWorker && isExternalOrder) {
            hidePrice = true;
            unitPrice = BigDecimal.ZERO;
            unitPriceHint = "外发订单，单价已锁定";
            log.debug("外发工厂员工扫码，隐藏单价: factoryId={}, orderNo={}", currentFactoryId, order.getOrderNo());
        } else if (isExternalOrder) {
            BigDecimal lockedPrice = com.fashion.supplychain.production.util.OrderPricingSnapshotUtils
                    .resolveOrderUnitPrice(order.getOrderDetails());
            if (lockedPrice != null && lockedPrice.compareTo(BigDecimal.ZERO) > 0) {
                unitPrice = lockedPrice;
                priceSource = isExternalFactoryAdmin ? "外发锁定单价" : "订单单价";
            }
        }

        if (!hidePrice && (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0)) {
            unitPrice = resolveUnitPriceFromTemplate(styleNo, processName);
            if (unitPrice != null && unitPrice.compareTo(BigDecimal.ZERO) > 0) {
                priceSource = "模板工序单价";
            }
        }

        if (!hidePrice && (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0)) {
            unitPrice = BigDecimal.ZERO;
            unitPriceHint = "未找到工序【" + processName + "】的单价配置，请在模板中心设置工序单价模板";
        }

        Map<String, Object> result = new HashMap<>();
        if (hidePrice) {
            result.put("unitPrice", null);
            result.put("hidePrice", true);
        } else {
            result.put("unitPrice", unitPrice.setScale(2, RoundingMode.HALF_UP));
        }
        result.put("styleNo", styleNo);
        result.put("processName", processName);
        if (hasText(unitPriceHint)) {
            result.put("unitPriceHint", unitPriceHint);
        }
        if (hasText(priceSource)) {
            result.put("priceSource", priceSource);
        }
        if (hasText(scanCode)) {
            result.put("scanCode", scanCode);
        }
        if (bundle != null && bundle.getBundleNo() != null) {
            result.put("bundleNo", String.valueOf(bundle.getBundleNo()));
        }
        if (order != null && hasText(order.getOrderNo())) {
            result.put("orderNo", order.getOrderNo());
        }
        return result;
    }

    /**
     * 从模板库解析工序单价（内部方法）
     * 匹配策略：精确匹配 → 标准节点匹配 → 模糊匹配
     */
    public BigDecimal resolveUnitPriceFromTemplate(String styleNo, String processName) {
        String sn = hasText(styleNo) ? styleNo.trim() : null;
        String pn = hasText(processName) ? processName.trim() : null;
        if (!hasText(sn) || !hasText(pn)) {
            return null;
        }

        try {
            Map<String, BigDecimal> prices = templateLibraryService.resolveProcessUnitPrices(sn);
            if (prices == null || prices.isEmpty()) {
                return null;
            }

            // 标准化固定生产节点名称
            String normalized = null;
            if (hasText(pn)) {
                String n = pn.trim();
                for (String node : FIXED_PRODUCTION_NODES) {
                    if (node.equals(n)) {
                        normalized = node;
                        break;
                    }
                }
            }
            if (hasText(normalized)) {
                BigDecimal exact = prices.get(normalized);
                if (exact != null && exact.compareTo(BigDecimal.ZERO) > 0) {
                    return exact;
                }
            }

            BigDecimal exact = prices.get(pn);
            if (exact != null && exact.compareTo(BigDecimal.ZERO) > 0) {
                return exact;
            }

            for (String n : FIXED_PRODUCTION_NODES) {
                if (!hasText(n)) {
                    continue;
                }
                if (templateLibraryService.progressStageNameMatches(n, pn)) {
                    BigDecimal v = prices.get(n);
                    if (v != null && v.compareTo(BigDecimal.ZERO) > 0) {
                        return v;
                    }
                }
            }

            for (Map.Entry<String, BigDecimal> e : prices.entrySet()) {
                if (e == null) {
                    continue;
                }
                String k = e.getKey();
                if (!hasText(k)) {
                    continue;
                }
                if (templateLibraryService.progressStageNameMatches(k, pn)) {
                    BigDecimal v = e.getValue();
                    return v == null ? null : v;
                }
            }
        } catch (Exception e) {
            log.warn("Failed to resolve unit price from template: styleNo={}, processName={}", sn, pn, e);
        }

        return null;
    }

    private ProductionOrder resolveOrder(String orderId, String orderNo) {
        String oid = hasText(orderId) ? orderId.trim() : null;
        if (hasText(oid)) {
            ProductionOrder o = productionOrderService.getById(oid);
            if (o == null || o.getDeleteFlag() == null || o.getDeleteFlag() != 0) {
                return null;
            }
            return o;
        }

        String on = hasText(orderNo) ? orderNo.trim() : null;
        if (!hasText(on)) {
            return null;
        }
        return productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getOrderNo, on)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .last("limit 1"));
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
