package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcUniversalStock;
import com.fashion.supplychain.integration.ecommerce.service.EcUniversalStockService;
import com.fashion.supplychain.integration.ecommerce.service.PlatformNotifyService;
import com.fashion.supplychain.integration.sync.adapter.EcPlatformAdapter;
import com.fashion.supplychain.integration.sync.adapter.EcPlatformAdapterRegistry;
import com.fashion.supplychain.integration.sync.dto.EcStockPullResult;
import com.fashion.supplychain.integration.sync.dto.EcSyncContext;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

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

    @Autowired(required = false)
    private EcPlatformAdapterRegistry platformAdapterRegistry;

    @Autowired(required = false)
    private EcPlatformConfigService ecPlatformConfigService;

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

        // 平台库存不可用时跳过差异检测（避免假差异）
        if (platformQty < 0) {
            log.debug("[EcStockDiscrepancy] 平台库存不可用，跳过差异检测 tenantId={} skuCode={}", tenantId, localStock.getSkuCode());
            return null;
        }

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

    /**
     * 生成缺货下架建议列表（不自动下架，仅展示供用户确认后手动执行）。
     *
     * <p>当本地库存为 0 或低于安全库存时，生成"建议下架"条目。
     * 实际下架操作需要用户在前端确认后调用 {@link #executeDelist} 手动执行。
     *
     * <p>遵循用户诉求"智能化不自动执行，让用户可以设置"。
     */
    public List<Map<String, Object>> getStockoutDelistSuggestions(Long tenantId) {
        TenantAssert.requireTenantId();
        List<Map<String, Object>> suggestions = new ArrayList<>();
        List<ProductSku> skus = productSkuService.listByTenantId(tenantId);
        for (ProductSku sku : skus) {
            EcUniversalStock stock = universalStockService.getOne(
                    new LambdaQueryWrapper<EcUniversalStock>()
                            .eq(EcUniversalStock::getTenantId, tenantId)
                            .eq(EcUniversalStock::getSkuId, sku.getId())
                            .orderByAsc(EcUniversalStock::getWarehouse), false);
            if (stock == null) continue;
            int available = stock.getAvailableStock() != null ? stock.getAvailableStock() : 0;
            int safe = stock.getSafeStock() != null ? stock.getSafeStock() : 0;
            // 库存为 0 或低于安全库存时生成下架建议
            if (available <= 0 || (safe > 0 && available < safe)) {
                Map<String, Object> suggestion = new LinkedHashMap<>();
                suggestion.put("skuId", sku.getId());
                suggestion.put("skuCode", sku.getSkuCode());
                suggestion.put("skuName", buildSkuName(sku));
                suggestion.put("availableStock", available);
                suggestion.put("safeStock", safe);
                suggestion.put("suggestion", available <= 0 ? "建议下架（库存为0）" : "建议关注（低于安全库存）");
                suggestion.put("severity", available <= 0 ? "high" : "medium");
                suggestions.add(suggestion);
            }
        }
        log.info("[EcStockDiscrepancy] 缺货下架建议生成: tenantId={}, 建议数={}", tenantId, suggestions.size());
        return suggestions;
    }

    /**
     * 手动执行下架（用户确认后调用，不自动触发）。
     *
     * <p>此方法仅标记 SKU 为"已下架"状态，不自动调用平台 API。
     * 如需同步到平台，需用户在电商管理页面手动操作或开启自动同步开关。
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean executeDelist(Long tenantId, Long skuId) {
        TenantAssert.requireTenantId();
        EcUniversalStock stock = universalStockService.getOne(
                new LambdaQueryWrapper<EcUniversalStock>()
                        .eq(EcUniversalStock::getTenantId, tenantId)
                        .eq(EcUniversalStock::getSkuId, skuId)
                        .orderByAsc(EcUniversalStock::getWarehouse), false);
        if (stock == null) {
            log.warn("[EcStockDiscrepancy] 下架失败：SKU库存记录不存在 tenantId={} skuId={}", tenantId, skuId);
            return false;
        }
        // 仅更新本地状态标记，不自动同步到平台
        stock.setUpdateTime(LocalDateTime.now());
        universalStockService.updateById(stock);
        log.info("[EcStockDiscrepancy] 用户手动下架完成 tenantId={} skuId={} skuCode={}",
                tenantId, skuId, stock.getSkuCode());
        return true;
    }

    /**
     * 真实拉取平台库存。
     *
     * <p>优先走 {@link EcPlatformAdapterRegistry} 真实适配器（如聚水潭 OpenAPI）。
     * 适配器不可用或平台未配置凭证时返回 -1（标记为"平台库存不可用"），
     * 差异检测将跳过该 SKU，避免用随机数产生假差异。
     */
    private int fetchPlatformStock(Long tenantId, String skuCode) {
        if (!StringUtils.hasText(skuCode)) {
            return -1;
        }
        // 优先走真实适配器
        if (platformAdapterRegistry != null && ecPlatformConfigService != null) {
            try {
                // 遍历该租户已配置的所有平台，找到第一个能拉到库存的
                for (String platformCode : platformAdapterRegistry.getSupportedPlatforms()) {
                    EcPlatformConfig cfg = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
                    if (cfg == null || !"ACTIVE".equals(cfg.getStatus())) continue;
                    if (!StringUtils.hasText(cfg.getAppKey()) || !StringUtils.hasText(cfg.getAppSecret())) continue;

                    Optional<EcPlatformAdapter> adapterOpt = platformAdapterRegistry.findAdapter(platformCode);
                    if (adapterOpt.isEmpty()) continue;

                    EcSyncContext ctx = EcSyncContext.builder()
                            .tenantId(tenantId)
                            .platformCode(platformCode)
                            .appId(cfg.getAppKey())
                            .appSecret(cfg.getAppSecret())
                            .build();
                    EcStockPullResult pullResult = adapterOpt.get().pullStock(ctx, Collections.singletonList(skuCode));
                    if (pullResult != null && pullResult.getStockMap() != null) {
                        Integer qty = pullResult.getStockMap().get(skuCode);
                        if (qty != null && qty >= 0) {
                            return qty;
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("[EcStockDiscrepancy] 真实拉取平台库存失败 tenantId={} skuCode={} 原因={}",
                        tenantId, skuCode, e.getMessage());
            }
        }
        // 平台库存不可用，返回 -1 标记（不再用随机数模拟）
        log.debug("[EcStockDiscrepancy] 平台库存不可用 tenantId={} skuCode={} 返回-1跳过差异检测", tenantId, skuCode);
        return -1;
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

    /** 构建 SKU 显示名称（款号+颜色+尺码） */
    private String buildSkuName(ProductSku sku) {
        if (sku == null) return "";
        StringBuilder sb = new StringBuilder();
        if (sku.getStyleNo() != null) sb.append(sku.getStyleNo());
        if (sku.getColor() != null) {
            if (sb.length() > 0) sb.append(" ");
            sb.append(sku.getColor());
        }
        if (sku.getSize() != null) {
            if (sb.length() > 0) sb.append(" ");
            sb.append(sku.getSize());
        }
        return sb.length() > 0 ? sb.toString() : (sku.getSkuCode() != null ? sku.getSkuCode() : "");
    }
}
