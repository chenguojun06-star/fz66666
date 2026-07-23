package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.entity.EcUniversalStock;
import com.fashion.supplychain.integration.ecommerce.service.EcUniversalStockService;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** 电商自动改价编排器：基于库存水平、销量速率、价格弹性自动计算最优价格并同步到电商平台 */
@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcPriceSyncOrchestrator {
    private static final BigDecimal MAX_DECREASE_RATIO = new BigDecimal("0.10"); // 降价幅度上限 10%
    private static final BigDecimal MAX_INCREASE_RATIO = new BigDecimal("0.05");  // 涨价幅度上限 5%
    private static final int SALES_WINDOW_DAYS = 30;   // 近期销量统计窗口（天）
    private static final double LOW_SALES_RATE = 0.5, HIGH_SALES_RATE = 2.0; // 低/高销量阈值（单/天）
    /** 内存中的调价建议缓存：key = tenantId:skuId */
    private final Map<String, PriceSuggestion> suggestionCache = new ConcurrentHashMap<>();
    @Autowired private EcUniversalStockService universalStockService;
    @Autowired private EcommerceOrderService ecommerceOrderService;
    @Autowired private ProductSkuService productSkuService;

    /** 计算指定 SKU 的最优价格：库存高+销量低→降价(≤10%)；库存低+销量高→涨价(≤5%)；库存正常→维持原价 */
    public BigDecimal calculateOptimalPrice(Long tenantId, Long skuId) {
        TenantAssert.requireTenantId();
        ProductSku sku = productSkuService.getById(skuId);
        if (sku == null) throw new IllegalArgumentException("SKU不存在: " + skuId);
        BigDecimal currentPrice = sku.getSalesPrice() != null ? sku.getSalesPrice() : sku.getTagPrice();
        if (currentPrice == null || currentPrice.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalStateException("SKU缺少有效销售价: " + skuId);
        }
        EcUniversalStock stock = getTotalStock(tenantId, skuId);
        int available = stock.getAvailableStock() != null ? stock.getAvailableStock() : 0;
        int safe = stock.getSafeStock() != null ? stock.getSafeStock() : 0;
        double salesRate = calcSalesRate(tenantId, sku.getSkuCode());

        BigDecimal newPrice = currentPrice;
        String reason = "库存正常，维持原价";
        if (available > safe * 2 && salesRate < LOW_SALES_RATE) {
            newPrice = currentPrice.subtract(currentPrice.multiply(MAX_DECREASE_RATIO)).setScale(2, RoundingMode.HALF_UP);
            reason = String.format("库存高(%d>%d)+销量低(%.2f单/天)，降价10%%", available, safe * 2, salesRate);
        } else if (available < safe && salesRate > HIGH_SALES_RATE) {
            newPrice = currentPrice.add(currentPrice.multiply(MAX_INCREASE_RATIO)).setScale(2, RoundingMode.HALF_UP);
            reason = String.format("库存低(%d<%d)+销量高(%.2f单/天)，涨价5%%", available, safe, salesRate);
        }
        cacheSuggestion(tenantId, skuId, currentPrice, newPrice, reason);
        log.info("[EcPriceSync] 调价计算: tenantId={}, skuId={}, {}→{}, 原因={}", tenantId, skuId, currentPrice, newPrice, reason);
        return newPrice;
    }

    /** 同步价格到电商平台（mock OpenAPI 调用，实际对接时替换为真实平台 API） */
    public boolean syncPriceToPlatform(Long tenantId, Long skuId, BigDecimal newPrice) {
        TenantAssert.requireTenantId();
        ProductSku sku = productSkuService.getById(skuId);
        if (sku == null) throw new IllegalArgumentException("SKU不存在: " + skuId);
        log.info("[EcPriceSync] mock同步价格到平台: tenantId={}, skuCode={}, newPrice={}", tenantId, sku.getSkuCode(), newPrice);
        PriceSuggestion s = suggestionCache.get(tenantId + ":" + skuId);
        if (s != null) s.setSynced(true);
        return true;
    }

    /** 批量同步所有需要调价的 SKU */
    public int batchSyncPrices(Long tenantId) {
        TenantAssert.requireTenantId();
        List<ProductSku> skus = productSkuService.listByTenantId(tenantId);
        int synced = 0;
        for (ProductSku sku : skus) {
            try {
                BigDecimal currentPrice = sku.getSalesPrice() != null ? sku.getSalesPrice() : sku.getTagPrice();
                BigDecimal newPrice = calculateOptimalPrice(tenantId, sku.getId());
                if (currentPrice != null && newPrice.compareTo(currentPrice) != 0
                        && syncPriceToPlatform(tenantId, sku.getId(), newPrice)) {
                    synced++;
                }
            } catch (Exception e) {
                log.warn("[EcPriceSync] 批量调价跳过失败SKU: skuId={}, {}", sku.getId(), e.getMessage());
            }
        }
        log.info("[EcPriceSync] 批量同步完成: tenantId={}, total={}, synced={}", tenantId, skus.size(), synced);
        return synced;
    }

    /** 获取待执行的调价建议列表 */
    public List<PriceSuggestion> getPriceChangeSuggestions(Long tenantId) {
        TenantAssert.requireTenantId();
        List<PriceSuggestion> result = new ArrayList<>();
        for (PriceSuggestion s : suggestionCache.values()) {
            if (s.getTenantId().equals(tenantId) && !s.isSynced()) result.add(s);
        }
        return result;
    }

    /** 获取 SKU 汇总库存（优先取 warehouse=null 的聚合记录，MySQL 中 ASC 排序 NULL 置顶） */
    private EcUniversalStock getTotalStock(Long tenantId, Long skuId) {
        EcUniversalStock stock = universalStockService.getOne(new LambdaQueryWrapper<EcUniversalStock>()
                .eq(EcUniversalStock::getTenantId, tenantId).eq(EcUniversalStock::getSkuId, skuId)
                .orderByAsc(EcUniversalStock::getWarehouse).last("LIMIT 1"), false);
        if (stock == null) {
            stock = new EcUniversalStock();
            stock.setAvailableStock(0);
            stock.setSafeStock(0);
        }
        return stock;
    }

    /** 计算近期销量速率（单/天） */
    private double calcSalesRate(Long tenantId, String skuCode) {
        if (skuCode == null || skuCode.isBlank()) return 0;
        List<EcommerceOrder> orders = ecommerceOrderService.list(new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getTenantId, tenantId).eq(EcommerceOrder::getSkuCode, skuCode)
                .ge(EcommerceOrder::getCreateTime, LocalDateTime.now().minusDays(SALES_WINDOW_DAYS)));
        int qty = orders.stream().mapToInt(o -> o.getQuantity() != null ? o.getQuantity() : 0).sum();
        return (double) qty / SALES_WINDOW_DAYS;
    }

    private void cacheSuggestion(Long tenantId, Long skuId, BigDecimal oldPrice, BigDecimal newPrice, String reason) {
        PriceSuggestion s = new PriceSuggestion();
        s.setTenantId(tenantId); s.setSkuId(skuId);
        s.setOldPrice(oldPrice); s.setNewPrice(newPrice);
        s.setReason(reason); s.setSynced(false);
        s.setCreateTime(LocalDateTime.now());
        suggestionCache.put(tenantId + ":" + skuId, s);
    }

    /** 调价建议 DTO（内存对象，无需持久化） */
    @Data
    public static class PriceSuggestion {
        private Long tenantId; private Long skuId;
        private BigDecimal oldPrice; private BigDecimal newPrice;
        private String reason; private boolean synced;
        private LocalDateTime createTime;
    }
}
