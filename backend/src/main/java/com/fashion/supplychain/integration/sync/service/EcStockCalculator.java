package com.fashion.supplychain.integration.sync.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@Slf4j
public class EcStockCalculator {

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductOutstockService productOutstockService;

    @Autowired
    private EcommerceOrderService ecommerceOrderService;

    @Autowired
    private ProductSkuService productSkuService;

    private static final int DEFAULT_BUFFER = 5;

    public int calculateAvailableStock(Long styleId, Long skuId) {
        ProductSku sku = productSkuService.getById(skuId);
        if (sku == null) {
            return 0;
        }
        int warehousedQty = sumWarehousedByStyle(styleId);
        int outstockedQty = sumOutstockedByStyle(styleId);
        int pendingShipQty = sumPendingShipByStyle(sku.getStyleNo());
        int buffer = DEFAULT_BUFFER;
        return Math.max(0, warehousedQty - outstockedQty - pendingShipQty - buffer);
    }

    public int calculateAvailableStockBySkuCode(String skuCode, Long tenantId) {
        ProductSku sku = productSkuService.getOne(new QueryWrapper<ProductSku>()
                .eq("sku_code", skuCode)
                .eq("tenant_id", tenantId)
                .last("LIMIT 1"));
        if (sku == null) {
            return 0;
        }
        return calculateAvailableStock(sku.getStyleId(), sku.getId());
    }

    private int sumWarehousedByStyle(Long styleId) {
        List<ProductWarehousing> records = productWarehousingService.list(new QueryWrapper<ProductWarehousing>()
                .eq("style_id", String.valueOf(styleId))
                .eq("delete_flag", 0)
                .notIn("warehousing_type", "quality_scan_scrap", "quality_scan"));
        return records.stream()
                .mapToInt(r -> r.getQualifiedQuantity() != null ? r.getQualifiedQuantity() : 0)
                .sum();
    }

    private int sumOutstockedByStyle(Long styleId) {
        List<ProductOutstock> records = productOutstockService.list(new QueryWrapper<ProductOutstock>()
                .eq("style_id", String.valueOf(styleId))
                .eq("delete_flag", 0));
        return records.stream()
                .mapToInt(r -> r.getOutstockQuantity() != null ? r.getOutstockQuantity() : 0)
                .sum();
    }

    private int sumPendingShipByStyle(String styleNo) {
        if (styleNo == null) {
            return 0;
        }
        List<EcommerceOrder> orders = ecommerceOrderService.list(new QueryWrapper<EcommerceOrder>()
                .eq("status", 1));
        return orders.stream()
                .filter(o -> styleNo.equals(extractStyleNo(o.getSkuCode())))
                .mapToInt(o -> o.getQuantity() != null ? o.getQuantity() : 0)
                .sum();
    }

    private String extractStyleNo(String skuCode) {
        if (skuCode == null) {
            return null;
        }
        int dashIdx = skuCode.indexOf('-');
        return dashIdx > 0 ? skuCode.substring(0, dashIdx) : skuCode;
    }
}
