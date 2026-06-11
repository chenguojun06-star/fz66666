package com.fashion.supplychain.integration.sync.event;

import com.fashion.supplychain.integration.ecommerce.orchestration.EcStockOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class EcStockSyncEventListener {

    @Autowired
    private EcStockOrchestrator ecStockOrchestrator;

    @EventListener
    public void onStockChange(StockChangeEvent event) {
        try {
            Long tenantId = event.getTenantId();
            if (tenantId != null && event.getStyleId() != null && event.getSkuId() != null) {
                ecStockOrchestrator.syncSkuStock(tenantId, event.getStyleId(), event.getSkuId());
                log.info("[EcStockSyncEventListener] 库存变更同步: skuId={}", event.getSkuId());
            }
        } catch (Exception e) {
            log.warn("[EcStockSyncEventListener] 库存同步失败", e);
        }
    }

    @EventListener
    public void onPriceChange(PriceChangeEvent event) {
        log.info("[EcStockSyncEventListener] 价格变更，暂不处理自动同步");
    }
}
