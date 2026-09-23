package com.fashion.supplychain.integration.sync.event;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

/**
 * 成品库存变动事件发布器（仓库 → 电商 联动的唯一出口）。
 *
 * <h3>为什么需要这个类</h3>
 * {@link StockChangeEvent} 与两个监听器（{@code EcStockSyncEventListener}、
 * {@code SyncEventListener}）长期存在，但<b>生产代码里没有任何发布方</b>，
 * 导致整条"入库/出库 → 电商库存重算 → 平台库存推送"链路是死代码：
 * {@code t_ec_universal_stock} 只会在"电商接单"时被动重算，
 * 入库/出库后数字不会刷新，联动面板显示的是过期库存。
 *
 * <h3>数据真实性约束</h3>
 * <ul>
 *   <li>只发布<b>真实发生</b>的库存变动，不做任何估算。</li>
 *   <li>SKU 解析不到时<b>静默跳过并记日志</b>，不发布伪造事件
 *       （{@link StockChangeEvent} 要求 styleId/skuId 均非空，缺失会污染下游统计）。</li>
 *   <li>事件在<b>事务提交后</b>发布：避免下游读到未提交数据算出错误库存；
 *       无事务时立即发布。</li>
 * </ul>
 */
@Slf4j
@Component
public class StockChangePublisher {

    private final ApplicationEventPublisher eventPublisher;
    private final ProductSkuService productSkuService;

    public StockChangePublisher(ApplicationEventPublisher eventPublisher,
                                ProductSkuService productSkuService) {
        this.eventPublisher = eventPublisher;
        this.productSkuService = productSkuService;
    }

    /**
     * 成品库存变动后发布事件（入库 INBOUND / 出库 OUTBOUND）。
     *
     * @param tenantId   租户ID（为空则跳过）
     * @param skuCode    SKU 编码（为空则跳过）
     * @param changeType 变动类型，仅用于日志与下游区分
     */
    public void publishAfterCommit(Long tenantId, String skuCode, String changeType) {
        if (tenantId == null || !StringUtils.hasText(skuCode)) {
            return;
        }
        String normalizedSkuCode = skuCode.trim();
        Runnable task = () -> doPublish(tenantId, normalizedSkuCode, changeType);

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    task.run();
                }
            });
        } else {
            task.run();
        }
    }

    private void doPublish(Long tenantId, String skuCode, String changeType) {
        try {
            ProductSku sku = productSkuService.getOne(new LambdaQueryWrapper<ProductSku>()
                    .eq(ProductSku::getSkuCode, skuCode)
                    .eq(ProductSku::getTenantId, tenantId)
                    .last("LIMIT 1"), false);
            if (sku == null || sku.getId() == null || sku.getStyleId() == null) {
                // 不编造 styleId/skuId：宁可跳过，也不发布半残事件
                log.debug("[StockChange] 未匹配到 SKU，跳过电商库存联动: tenantId={}, skuCode={}, changeType={}",
                        tenantId, skuCode, changeType);
                return;
            }
            eventPublisher.publishEvent(
                    new StockChangeEvent(this, sku.getStyleId(), sku.getId(), tenantId, changeType));
            log.debug("[StockChange] 已发布库存变更事件: tenantId={}, skuId={}, skuCode={}, changeType={}",
                    tenantId, sku.getId(), skuCode, changeType);
        } catch (Exception e) {
            log.warn("[StockChange] 发布库存变更事件失败: tenantId={}, skuCode={}, changeType={}, err={}",
                    tenantId, skuCode, changeType, e.getMessage());
        }
    }
}
