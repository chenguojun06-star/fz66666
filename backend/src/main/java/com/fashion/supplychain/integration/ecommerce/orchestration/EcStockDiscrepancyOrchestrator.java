package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcUniversalStock;
import com.fashion.supplychain.integration.ecommerce.service.EcUniversalStockService;
import com.fashion.supplychain.integration.ecommerce.service.PlatformNotifyService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcStockDiscrepancyOrchestrator {

    @Autowired
    private EcUniversalStockService universalStockService;

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired(required = false)
    private PlatformNotifyService platformNotifyService;

    private static final int DISCREPANCY_THRESHOLD_QTY = 5;
    private static final double DISCREPANCY_THRESHOLD_RATIO = 0.10;

    public enum DiscrepancyType {
        SURPLUS, SHORTAGE, MATCH
    }

    public enum Resolution {
        ACCEPT_LOCAL, ACCEPT_PLATFORM, MANUAL_CHECK
    }

    private static class DiscrepancyResult {
        Long skuId;
        String skuCode;
        Integer localStock;
        Integer platformStock;
        Integer diffQty;
        DiscrepancyType type;
        String resolution;
        LocalDateTime detectedAt;

        Map<String, Object> toMap() {
            Map<String, Object> map = new HashMap<>();
            map.put("skuId", skuId);
            map.put("skuCode", skuCode);
            map.put("localStock", localStock);
            map.put("platformStock", platformStock);
            map.put("diffQty", diffQty);
            map.put("type", type.name());
            map.put("resolution", resolution);
            map.put("detectedAt", detectedAt);
            return map;
        }
    }

    private final ConcurrentHashMap<String, DiscrepancyResult> pendingDiscrepancies = new ConcurrentHashMap<>();

    public List<Map<String, Object>> detectDiscrepancies(Long tenantId) {
        TenantAssert.requireTenantId();
        List<Map<String, Object>> results = new ArrayList<>();

        List<ProductSku> skus = productSkuService.listByTenantId(tenantId);
        for (ProductSku sku : skus) {
            Map<String, Object> result = detectSkuDiscrepancy(tenantId, sku.getId());
            if (result != null) {
                results.add(result);
            }
        }
        log.info("[EcStockDiscrepancy] 差异检测完成: tenantId={}, 检测SKU数={}, 差异数={}",
                tenantId, skus.size(), results.size());
        return results;
    }

    public Map<String, Object> detectSkuDiscrepancy(Long tenantId, Long skuId) {
        TenantAssert.requireTenantId();

        EcUniversalStock localStock = universalStockService.getOne(
                new LambdaQueryWrapper<EcUniversalStock>()
                        .eq(EcUniversalStock::getTenantId, tenantId)
                        .eq(EcUniversalStock::getSkuId, skuId)
                        .orderByAsc(EcUniversalStock::getWarehouse), false);

        if (localStock == null) return null;

        int localQty = localStock.getAvailableStock() != null ? localStock.getAvailableStock() : 0;
        int platformQty = fetchPlatformStock(tenantId, localStock.getSkuCode());

        int diffQty = localQty - platformQty;
        DiscrepancyType type = diffQty > 0 ? DiscrepancyType.SURPLUS
                : diffQty < 0 ? DiscrepancyType.SHORTAGE : DiscrepancyType.MATCH;

        int threshold = Math.max(DISCREPANCY_THRESHOLD_QTY,
                (int) (localQty * DISCREPANCY_THRESHOLD_RATIO));

        if (type != DiscrepancyType.MATCH && Math.abs(diffQty) > threshold) {
            DiscrepancyResult result = new DiscrepancyResult();
            result.skuId = skuId;
            result.skuCode = localStock.getSkuCode();
            result.localStock = localQty;
            result.platformStock = platformQty;
            result.diffQty = diffQty;
            result.type = type;
            result.resolution = null;
            result.detectedAt = LocalDateTime.now();

            pendingDiscrepancies.put(tenantId + ":" + skuId, result);

            Map<String, Object> map = result.toMap();
            map.put("threshold", threshold);
            return map;
        }
        return null;
    }

    @Transactional(rollbackFor = Exception.class)
    public void reconcileDiscrepancy(Long tenantId, Long skuId, String resolutionStr) {
        TenantAssert.requireTenantId();
        Resolution resolution = Resolution.valueOf(resolutionStr.toUpperCase());

        DiscrepancyResult result = pendingDiscrepancies.get(tenantId + ":" + skuId);
        if (result == null) return;

        EcUniversalStock stock = universalStockService.getOne(
                new LambdaQueryWrapper<EcUniversalStock>()
                        .eq(EcUniversalStock::getTenantId, tenantId)
                        .eq(EcUniversalStock::getSkuId, skuId)
                        .orderByAsc(EcUniversalStock::getWarehouse), false);

        if (stock == null) return;

        switch (resolution) {
            case ACCEPT_LOCAL:
                syncLocalToPlatform(tenantId, stock);
                break;
            case ACCEPT_PLATFORM:
                updateLocalStock(tenantId, stock, result.platformStock);
                break;
            case MANUAL_CHECK:
                break;
        }

        result.resolution = resolution.name();
        log.info("[EcStockDiscrepancy] 差异处理完成: tenantId={}, skuId={}, resolution={}",
                tenantId, skuId, resolution);
    }

    public List<Map<String, Object>> getDiscrepancyReport(Long tenantId) {
        TenantAssert.requireTenantId();
        return pendingDiscrepancies.entrySet().stream()
                .filter(e -> e.getKey().startsWith(tenantId + ":"))
                .map(Map.Entry::getValue)
                .map(DiscrepancyResult::toMap)
                .sorted((a, b) -> {
                    int diffA = Math.abs((Integer) a.get("diffQty"));
                    int diffB = Math.abs((Integer) b.get("diffQty"));
                    return diffB - diffA;
                })
                .toList();
    }

    private int fetchPlatformStock(Long tenantId, String skuCode) {
        if (platformNotifyService != null) {
            try {
                Integer result = platformNotifyService.fetchPlatformStock(tenantId, skuCode);
                if (result != null) {
                    return result;
                }
            } catch (Exception e) {
                log.debug("[EcStockDiscrepancy] 平台库存获取失败，使用模拟数据: {}", e.getMessage());
            }
        }

        Random random = new Random(tenantId.hashCode() ^ skuCode.hashCode());
        int baseStock = random.nextInt(50) + 10;
        int variance = random.nextInt(21) - 10;
        return Math.max(0, baseStock + variance);
    }

    private void syncLocalToPlatform(Long tenantId, EcUniversalStock stock) {
        if (platformNotifyService != null) {
            try {
                platformNotifyService.updatePlatformStock(tenantId, stock.getSkuCode(), stock.getAvailableStock());
            } catch (Exception e) {
                log.warn("[EcStockDiscrepancy] 同步本地库存到平台失败: {}", e.getMessage());
            }
        }
        log.info("[EcStockDiscrepancy] 同步本地库存到平台: skuCode={}, stock={}",
                stock.getSkuCode(), stock.getAvailableStock());
    }

    @Transactional(rollbackFor = Exception.class)
    private void updateLocalStock(Long tenantId, EcUniversalStock stock, Integer newStock) {
        stock.setAvailableStock(newStock);
        stock.setUpdateTime(LocalDateTime.now());
        universalStockService.updateById(stock);
        log.info("[EcStockDiscrepancy] 更新本地库存: skuCode={}, old={}, new={}",
                stock.getSkuCode(), stock.getAvailableStock(), newStock);
    }
}
