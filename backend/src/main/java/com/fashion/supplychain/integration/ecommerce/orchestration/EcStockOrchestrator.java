package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcPurchaseSuggestion;
import com.fashion.supplychain.integration.ecommerce.entity.EcStockAlert;
import com.fashion.supplychain.integration.ecommerce.entity.EcUniversalStock;
import com.fashion.supplychain.integration.ecommerce.service.EcPurchaseSuggestionService;
import com.fashion.supplychain.integration.ecommerce.service.EcStockAlertService;
import com.fashion.supplychain.integration.ecommerce.service.EcUniversalStockService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcStockOrchestrator {

    @Autowired private EcUniversalStockService universalStockService;
    @Autowired private EcStockAlertService stockAlertService;
    @Autowired private EcPurchaseSuggestionService purchaseSuggestionService;
    @Autowired private ProductSkuService productSkuService;

    @Transactional(rollbackFor = Exception.class)
    public void syncAllStock(Long tenantId) {
        TenantAssert.requireTenantId();
        productSkuService.listByTenantId(tenantId).stream()
                .forEach(sku -> universalStockService.recalculateStock(tenantId, sku.getStyleId(), sku.getId()));
        checkAndCreateAlerts(tenantId);
        log.info("[EcStockOrchestrator] 全量库存同步完成: tenantId={}", tenantId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void syncSkuStock(Long tenantId, Long styleId, Long skuId) {
        TenantAssert.requireTenantId();
        universalStockService.recalculateStock(tenantId, styleId, skuId);
        checkAlertForSku(tenantId, skuId);
        log.info("[EcStockOrchestrator] SKU库存同步: tenantId={}, skuId={}", tenantId, skuId);
    }

    public void checkAndCreateAlerts(Long tenantId) {
        universalStockService.listLowStock(tenantId).forEach(stock -> {
            String alertType = stock.getAvailableStock() <= 0 ? "OUT_OF_STOCK" : "LOW_STOCK";
            if (!stockAlertService.existsUnresolved(tenantId, stock.getSkuId(), alertType)) {
                createAlert(tenantId, stock, alertType);
            }
        });
    }

    private void checkAlertForSku(Long tenantId, Long skuId) {
        universalStockService.list(new LambdaQueryWrapper<EcUniversalStock>()
                .eq(EcUniversalStock::getTenantId, tenantId).eq(EcUniversalStock::getSkuId, skuId))
                .stream().filter(s -> s.getAvailableStock() <= s.getSafeStock())
                .forEach(stock -> {
                    String alertType = stock.getAvailableStock() <= 0 ? "OUT_OF_STOCK" : "LOW_STOCK";
                    if (!stockAlertService.existsUnresolved(tenantId, skuId, alertType)) {
                        createAlert(tenantId, stock, alertType);
                    }
                });
    }

    private void createAlert(Long tenantId, EcUniversalStock stock, String alertType) {
        EcStockAlert alert = new EcStockAlert();
        alert.setTenantId(tenantId);
        alert.setStyleId(stock.getStyleId());
        alert.setSkuId(stock.getSkuId());
        if (stock.getSkuCode() != null) {
            alert.setSkuCode(stock.getSkuCode());
        } else if (stock.getSkuId() != null) {
            ProductSku sku = productSkuService.getById(stock.getSkuId());
            if (sku != null) alert.setSkuCode(sku.getSkuCode());
        }
        alert.setWarehouse(stock.getWarehouse());
        alert.setAlertType(alertType);
        alert.setCurrentStock(stock.getAvailableStock());
        alert.setSafeStock(stock.getSafeStock());
        alert.setIsResolved(false);
        alert.setMessage("OUT_OF_STOCK".equals(alertType) ? "库存为0，请立即补货"
                : "库存低于安全库存(" + stock.getSafeStock() + ")，当前可售" + stock.getAvailableStock());
        stockAlertService.save(alert);
        log.warn("[EcStockOrchestrator] 库存预警: skuId={}, skuCode={}, type={}, stock={}",
                stock.getSkuId(), alert.getSkuCode(), alertType, stock.getAvailableStock());
    }

    @Transactional(rollbackFor = Exception.class)
    public void generatePurchaseSuggestions(Long tenantId) {
        TenantAssert.requireTenantId();
        List<EcUniversalStock> lowStocks = universalStockService.listLowStock(tenantId);
        for (EcUniversalStock stock : lowStocks) {
            int suggestQty = calculateSuggestQuantity(stock);
            if (suggestQty > 0) purchaseSuggestionService.save(buildSuggestion(tenantId, stock, suggestQty));
        }
        log.info("[EcStockOrchestrator] 采购建议生成完成: tenantId={}, count={}", tenantId, lowStocks.size());
    }

    private EcPurchaseSuggestion buildSuggestion(Long tenantId, EcUniversalStock stock, int suggestQty) {
        EcPurchaseSuggestion s = new EcPurchaseSuggestion();
        s.setTenantId(tenantId);
        s.setStyleId(stock.getStyleId());
        s.setSkuId(stock.getSkuId());
        if (stock.getSkuCode() != null) {
            s.setSkuCode(stock.getSkuCode());
        } else if (stock.getSkuId() != null) {
            ProductSku sku = productSkuService.getById(stock.getSkuId());
            if (sku != null) s.setSkuCode(sku.getSkuCode());
        }
        s.setSuggestQuantity(suggestQty);
        s.setUrgencyLevel(stock.getAvailableStock() <= 0 ? "HIGH" : "MEDIUM");
        s.setAvailableStock(stock.getAvailableStock());
        s.setOnWayProduction(stock.getOnWayProduction());
        s.setTargetDays(30);
        s.setStatus(0);
        s.setReason("库存低于安全库存，建议采购" + suggestQty + "件");
        return s;
    }

    private int calculateSuggestQuantity(EcUniversalStock stock) {
        int safe = stock.getSafeStock() != null ? stock.getSafeStock() : 0;
        int avail = stock.getAvailableStock() != null ? stock.getAvailableStock() : 0;
        int onWay = stock.getOnWayProduction() != null ? stock.getOnWayProduction() : 0;
        return Math.max(0, safe * 2 - avail - onWay);
    }

    /**
     * 批量更新指定 SKU 下所有库存记录的安全库存值
     *
     * @param tenantId  租户ID
     * @param skuId     SKU ID
     * @param safeStock 新的安全库存值
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateSafeStock(Long tenantId, Long skuId, Integer safeStock) {
        if (tenantId == null || skuId == null || safeStock == null) {
            throw new IllegalArgumentException("tenantId, skuId 和 safeStock 不能为空");
        }
        List<EcUniversalStock> stocks = universalStockService.list(
                new LambdaQueryWrapper<EcUniversalStock>()
                        .eq(EcUniversalStock::getTenantId, tenantId)
                        .eq(EcUniversalStock::getSkuId, skuId));
        for (EcUniversalStock stock : stocks) {
            stock.setSafeStock(safeStock);
            universalStockService.updateById(stock);
        }
        log.info("[EcStockOrchestrator] 安全库存更新完成: tenantId={}, skuId={}, count={}",
                tenantId, skuId, stocks.size());
    }
}