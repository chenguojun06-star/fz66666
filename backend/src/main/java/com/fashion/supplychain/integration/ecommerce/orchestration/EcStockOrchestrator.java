package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcOrderSplit;
import com.fashion.supplychain.integration.ecommerce.entity.EcPurchaseSuggestion;
import com.fashion.supplychain.integration.ecommerce.entity.EcStockAlert;
import com.fashion.supplychain.integration.ecommerce.entity.EcUniversalStock;
import com.fashion.supplychain.integration.ecommerce.entity.EcWarehouseAllocation;
import com.fashion.supplychain.integration.ecommerce.service.EcOrderSplitService;
import com.fashion.supplychain.integration.ecommerce.service.EcPurchaseSuggestionService;
import com.fashion.supplychain.integration.ecommerce.service.EcStockAlertService;
import com.fashion.supplychain.integration.ecommerce.service.EcUniversalStockService;
import com.fashion.supplychain.integration.ecommerce.service.EcWarehouseAllocationService;
import com.fashion.supplychain.integration.ecommerce.helper.PlatformNotifyHelper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.system.service.BackendActionFlagService;
import com.fashion.supplychain.system.service.BackendActionFlagService.BackendActionKey;
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
    /** D-640：分仓分配 / 订单拆分查询（原在 EcStockController 直接注入） */
    @Autowired private EcWarehouseAllocationService allocationService;
    @Autowired private EcOrderSplitService orderSplitService;
    @Autowired private ProductSkuService productSkuService;
    /** D-532：组合商品（套装）——组合可售库存随 SKU 一并推送平台 */
    @Autowired(required = false) private com.fashion.supplychain.warehouse.service.ComboProductService comboProductService;
    @Autowired(required = false) private com.fashion.supplychain.warehouse.service.ComboProductItemService comboProductItemService;

    /** 平台库存推送（真实推送到电商平台的唯一出口），集成模块未启用时可缺省 */
    @Autowired(required = false) private PlatformNotifyHelper platformNotifyHelper;
    /** 后端动作开关：控制是否自动推送库存到平台 */
    @Autowired(required = false) private BackendActionFlagService backendActionFlagService;

    /**
     * 全量重算本地电商库存并生成预警。
     *
     * <p><b>语义澄清</b>：本方法名含"同步"，但历史上<b>只做本地重算</b>——
     * 依据生产/入库数据重算 EcUniversalStock 并触发低库存预警，
     * <b>不会把库存推到任何电商平台</b>。这个名实不符曾导致误判
     * （以为点一次就能把库存同步到淘宝/京东）。
     *
     * <p>如需真正推送到平台，请调用 {@link #pushStockToPlatform}（受开关控制）。
     *
     * @return 本次实际重算的 SKU 数量（供前端提示"已重算 N 个 SKU"，
     *         避免接口只返回成功却看不到到底算了几条）
     */
    @Transactional(rollbackFor = Exception.class)
    public int syncAllStock(Long tenantId) {
        TenantAssert.requireTenantId();
        List<ProductSku> skus = productSkuService.listByTenantId(tenantId);
        skus.forEach(sku -> universalStockService.recalculateStock(tenantId, sku.getStyleId(), sku.getId()));
        checkAndCreateAlerts(tenantId);
        log.info("[EcStockOrchestrator] 本地库存重算完成: tenantId={}, skuCount={}", tenantId, skus.size());
        return skus.size();
    }

    /**
     * 将本地库存真正推送到电商平台。
     *
     * <p>与 {@link #syncAllStock}（仅本地重算）区分开，本方法才是对外同步。
     * 遵循"智能化不自动执行，让用户可以设置"的原则，受
     * {@link BackendActionKey#AUTO_EC_STOCK_SYNC} 开关控制：关闭时只记录日志、不推送。
     *
     * @return 成功推送的 SKU 数量
     */
    public int pushStockToPlatform(Long tenantId) {
        TenantAssert.requireTenantId();
        if (platformNotifyHelper == null) {
            log.warn("[EcStockOrchestrator] 平台通知服务未装配，无法推送库存 tenantId={}", tenantId);
            return 0;
        }
        boolean enabled = backendActionFlagService != null
                && backendActionFlagService.isEnabled(tenantId, BackendActionKey.AUTO_EC_STOCK_SYNC);
        if (!enabled) {
            log.info("[EcStockOrchestrator] 电商库存自动同步开关未开启，仅本地库存不推送平台 tenantId={}", tenantId);
            return 0;
        }
        List<EcUniversalStock> stocks = universalStockService.listByTenant(tenantId);
        int pushed = 0, failed = 0;
        for (EcUniversalStock stock : stocks) {
            if (stock.getSkuCode() == null) continue;
            boolean ok = platformNotifyHelper.updatePlatformStock(
                    tenantId, stock.getSkuCode(), stock.getAvailableStock());
            if (ok) {
                pushed++;
            } else {
                failed++;
            }
        }

        // D-532：组合商品（套装）可售库存一并推送——组合在平台侧是独立商品（编码=comboCode），
        // 可售(套)=min(子SKU可用库存/单套数量)，任一子SKU缺货即套数为0
        pushed += pushComboStockToPlatform(tenantId, platformNotifyHelper);

        log.info("[EcStockOrchestrator] 库存推送平台完成: tenantId={}, 成功={}, 失败={}",
                tenantId, pushed, failed);
        return pushed;
    }

    /**
     * D-532：推送组合商品（套装）可售库存到平台。失败不阻断 SKU 推送主流程。
     */
    private int pushComboStockToPlatform(Long tenantId, PlatformNotifyHelper notifyService) {
        if (comboProductService == null || comboProductItemService == null) {
            return 0;
        }
        int pushed = 0;
        try {
            List<com.fashion.supplychain.warehouse.entity.ComboProduct> combos = comboProductService.lambdaQuery()
                    .eq(com.fashion.supplychain.warehouse.entity.ComboProduct::getTenantId, tenantId)
                    .eq(com.fashion.supplychain.warehouse.entity.ComboProduct::getStatus, "ENABLED")
                    .list();
            for (com.fashion.supplychain.warehouse.entity.ComboProduct combo : combos) {
                List<com.fashion.supplychain.warehouse.entity.ComboProductItem> items =
                        comboProductItemService.lambdaQuery()
                                .eq(com.fashion.supplychain.warehouse.entity.ComboProductItem::getComboId, combo.getId())
                                .list();
                if (items.isEmpty()) continue;
                java.util.Set<String> codes = new java.util.HashSet<>();
                for (com.fashion.supplychain.warehouse.entity.ComboProductItem it : items) {
                    if (it.getSkuCode() != null) codes.add(it.getSkuCode());
                }
                if (codes.isEmpty()) continue;
                java.util.Map<String, Integer> stockByCode = new java.util.HashMap<>();
                for (ProductSku sku : productSkuService.lambdaQuery()
                        .eq(ProductSku::getTenantId, tenantId)
                        .in(ProductSku::getSkuCode, codes)
                        .list()) {
                    stockByCode.put(sku.getSkuCode(), sku.getStockQuantity() != null ? Math.max(0, sku.getStockQuantity()) : 0);
                }
                int available = Integer.MAX_VALUE;
                for (com.fashion.supplychain.warehouse.entity.ComboProductItem it : items) {
                    int stock = stockByCode.getOrDefault(it.getSkuCode(), 0);
                    int perSet = it.getQuantity() != null && it.getQuantity() > 0 ? it.getQuantity() : 1;
                    available = Math.min(available, stock / perSet);
                }
                if (available == Integer.MAX_VALUE) continue;
                boolean ok = notifyService.updatePlatformStock(tenantId, combo.getComboCode(), available);
                if (ok) {
                    pushed++;
                } else {
                    log.warn("[EcStockOrchestrator] 组合库存推送失败: combo={} 可用={}套", combo.getComboCode(), available);
                }
            }
        } catch (Exception e) {
            log.warn("[EcStockOrchestrator] 组合库存推送异常（不影响SKU推送）: tenantId={} err={}", tenantId, e.getMessage());
        }
        return pushed;
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

    // ===== D-640：以下查询方法从 EcStockController 下沉 =====
    // 原 Controller 直接注入了 EcUniversalStockService / EcStockAlertService /
    // EcPurchaseSuggestionService / EcWarehouseAllocationService / EcOrderSplitService
    // 共 5 个 Service，属「Controller 依赖多个 Service」。
    // 前 3 个本类早已持有，故只补后 2 个依赖。

    /** 当前租户的全量电商库存 */
    public List<EcUniversalStock> listStock(Long tenantId) {
        return universalStockService.listByTenant(tenantId);
    }

    /** 当前租户的低库存记录 */
    public List<EcUniversalStock> listLowStock(Long tenantId) {
        return universalStockService.listLowStock(tenantId);
    }

    /**
     * 库存预警列表。
     *
     * @param unresolvedOnly true 只看未处理；false 看全部
     */
    public List<EcStockAlert> listAlerts(Long tenantId, boolean unresolvedOnly) {
        if (unresolvedOnly) {
            return stockAlertService.listUnresolved(tenantId);
        }
        return stockAlertService.listByTenant(tenantId);
    }

    /**
     * 采购建议列表。
     *
     * @param pendingOnly true 只看待处理；false 看全部
     */
    public List<EcPurchaseSuggestion> listSuggestions(Long tenantId, boolean pendingOnly) {
        if (pendingOnly) {
            return purchaseSuggestionService.listPending(tenantId);
        }
        return purchaseSuggestionService.listByTenant(tenantId);
    }

    /** 分仓分配记录 */
    public List<EcWarehouseAllocation> listAllocations(Long tenantId) {
        return allocationService.listByTenant(tenantId);
    }

    /** 订单拆分记录 */
    public List<EcOrderSplit> listSplits(Long tenantId) {
        return orderSplitService.listByTenant(tenantId);
    }
}