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
import com.fashion.supplychain.warehouse.constant.OutstockTypeConstants;
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
        int pendingShipQty = sumPendingShipByStyle(styleId);
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

    /**
     * 已销售出库量（用于电商可售库存扣减）。
     *
     * <p>【D-800为什么必须过滤类型】原来只按 {@code delete_flag=0} 汇总全表出库量，
     * 导致 <b>调拨、报废、样衣出库、冲销单全部被当成销售</b>扣减可售库存。
     * 调拨只是仓库之间挪货、报废是损耗，都不是「卖掉了」，凭什么占用电商可售额度？
     * 结果是电商可售库存被内部流转侵蚀、越用越低。
     *
     * <p>【冲销单】D-800 起冲销数量存负数（红字），这里用类型过滤直接排除，
     * 不用靠正负号判断 —— 万一未来有其他负数场景也不会误伤。
     */
    private int sumOutstockedByStyle(Long styleId) {
        List<ProductOutstock> records = productOutstockService.list(new QueryWrapper<ProductOutstock>()
                .eq("style_id", String.valueOf(styleId))
                .eq("delete_flag", 0)
                .in("outstock_type", OutstockTypeConstants.SALE_OUTSTOCK_TYPES));
        return records.stream()
                .mapToInt(r -> r.getOutstockQuantity() != null ? r.getOutstockQuantity() : 0)
                .sum();
    }

    /**
     * 待发货占用量：按该款下<b>真实 SKU 编码</b>精确匹配电商订单。
     *
     * <p>不要用 {@code indexOf('-')} 之类的字符串切分去猜款号：真实 SKU 编码是
     * "款号直接拼颜色尺码"（如 {@code BR24XQ0098E草绿色L(170/84A)}），不含分隔符，
     * 切分结果恒等于整串，会导致待发货占用永远统计为 0（可售库存虚高）。
     */
    private int sumPendingShipByStyle(Long styleId) {
        List<String> skuCodes = skuCodesOfStyle(styleId);
        if (skuCodes.isEmpty()) {
            return 0;
        }
        List<EcommerceOrder> orders = ecommerceOrderService.list(new QueryWrapper<EcommerceOrder>()
                .eq("status", 1)
                .in("sku_code", skuCodes));
        return orders.stream()
                .mapToInt(o -> o.getQuantity() != null ? o.getQuantity() : 0)
                .sum();
    }

    /** 该款下的全部内部 SKU 编码（用于精确匹配只有 sku_code 的电商订单表） */
    private List<String> skuCodesOfStyle(Long styleId) {
        if (styleId == null) {
            return List.of();
        }
        return productSkuService.list(new QueryWrapper<ProductSku>()
                        .select("sku_code")
                        .eq("style_id", styleId))
                .stream()
                .map(ProductSku::getSkuCode)
                .filter(c -> c != null && !c.isBlank())
                .distinct()
                .toList();
    }
}
