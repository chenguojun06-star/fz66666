package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.system.entity.TenantSmartFeature;
import com.fashion.supplychain.system.service.TenantSmartFeatureService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Slf4j
@Service
public class TenantSmartFeatureOrchestrator {

    public static final List<String> SUPPORTED_FEATURE_KEYS = Arrays.asList(
            "smart.guide.enabled",
            "smart.dict.autocollect.enabled",
            "smart.production.precheck.enabled",
            "smart.finance.explain.enabled",
            "smart.system.guard.enabled",
            "smart.worker-profile.enabled",
            "smart.warehousing.audit.enabled",
            "smart.material.inventory.ai.enabled",
            "smart.material.purchase.ai.enabled"
    );

    public static final List<String> MINIPROGRAM_MENU_KEYS = Arrays.asList(
            "miniprogram.menu.smartOps",
            "miniprogram.menu.dashboard",
            "miniprogram.menu.quality",
            "miniprogram.menu.bundleSplit",
            "miniprogram.menu.cuttingDetail"
    );

    public static final List<String> ALL_FEATURE_KEYS;
    static {
        List<String> all = new ArrayList<>(SUPPORTED_FEATURE_KEYS);
        all.addAll(MINIPROGRAM_MENU_KEYS);
        ALL_FEATURE_KEYS = all;
    }

    @Autowired
    private TenantSmartFeatureService tenantSmartFeatureService;

    public Map<String, Boolean> listCurrentTenantFeatures() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return defaultFeatureFlags();
        }
        try {
            Map<String, Boolean> flags = defaultFeatureFlags();
            List<TenantSmartFeature> rows = tenantSmartFeatureService.list(
                    new LambdaQueryWrapper<TenantSmartFeature>()
                            .eq(TenantSmartFeature::getTenantId, tenantId)
                            .in(TenantSmartFeature::getFeatureKey, SUPPORTED_FEATURE_KEYS)
            );
            for (TenantSmartFeature row : rows) {
                if (StringUtils.hasText(row.getFeatureKey())) {
                    flags.put(row.getFeatureKey(), Boolean.TRUE.equals(row.getEnabled()));
                }
            }
            return flags;
        } catch (Exception e) {
            log.warn("[TenantSmartFeature] 查询智能开关失败，返回默认值 tenantId={}", tenantId, e);
            return defaultFeatureFlags();
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Boolean> saveCurrentTenantFeatures(Map<String, Boolean> features) {
        TenantAssert.assertTenantContext();
        assertWritable();
        Long tenantId = TenantAssert.requireTenantId();

        Map<String, Boolean> nextFlags = defaultFeatureFlags();
        if (features != null) {
            features.forEach((key, value) -> {
                if (SUPPORTED_FEATURE_KEYS.contains(key)) {
                    nextFlags.put(key, Boolean.TRUE.equals(value));
                }
            });
        }

        List<TenantSmartFeature> existing = tenantSmartFeatureService.list(
                new LambdaQueryWrapper<TenantSmartFeature>()
                        .eq(TenantSmartFeature::getTenantId, tenantId)
                        .in(TenantSmartFeature::getFeatureKey, SUPPORTED_FEATURE_KEYS)
        );
        Map<String, TenantSmartFeature> existingMap = existing.stream()
                .filter(item -> StringUtils.hasText(item.getFeatureKey()))
                .collect(Collectors.toMap(TenantSmartFeature::getFeatureKey, item -> item, (a, b) -> a, LinkedHashMap::new));

        List<TenantSmartFeature> updates = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        for (String featureKey : SUPPORTED_FEATURE_KEYS) {
            TenantSmartFeature row = existingMap.get(featureKey);
            if (row == null) {
                row = new TenantSmartFeature();
                row.setTenantId(tenantId);
                row.setFeatureKey(featureKey);
                row.setCreateTime(now);
            }
            row.setEnabled(Boolean.TRUE.equals(nextFlags.get(featureKey)));
            row.setUpdateTime(now);
            updates.add(row);
        }

        tenantSmartFeatureService.saveOrUpdateBatch(updates);
        log.info("[TenantSmartFeature] 保存租户智能开关 tenantId={} count={}", tenantId, updates.size());
        return nextFlags;
    }

    public Map<String, Boolean> listMiniprogramMenuFlags() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return defaultMiniprogramMenuFlags();
        }
        try {
            Map<String, Boolean> flags = defaultMiniprogramMenuFlags();
            List<TenantSmartFeature> rows = tenantSmartFeatureService.list(
                    new LambdaQueryWrapper<TenantSmartFeature>()
                            .eq(TenantSmartFeature::getTenantId, tenantId)
                            .in(TenantSmartFeature::getFeatureKey, MINIPROGRAM_MENU_KEYS)
            );
            for (TenantSmartFeature row : rows) {
                if (StringUtils.hasText(row.getFeatureKey())) {
                    flags.put(row.getFeatureKey(), Boolean.TRUE.equals(row.getEnabled()));
                }
            }
            return flags;
        } catch (Exception e) {
            log.warn("[TenantSmartFeature] 查询小程序菜单配置失败，返回默认值 tenantId={}", tenantId, e);
            return defaultMiniprogramMenuFlags();
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Boolean> saveMiniprogramMenuFlags(Map<String, Boolean> menus) {
        TenantAssert.assertTenantContext();
        assertWritable();
        Long tenantId = TenantAssert.requireTenantId();

        Map<String, Boolean> nextFlags = defaultMiniprogramMenuFlags();
        if (menus != null) {
            menus.forEach((key, value) -> {
                if (MINIPROGRAM_MENU_KEYS.contains(key)) {
                    nextFlags.put(key, Boolean.TRUE.equals(value));
                }
            });
        }

        List<TenantSmartFeature> existing = tenantSmartFeatureService.list(
                new LambdaQueryWrapper<TenantSmartFeature>()
                        .eq(TenantSmartFeature::getTenantId, tenantId)
                        .in(TenantSmartFeature::getFeatureKey, MINIPROGRAM_MENU_KEYS)
        );
        Map<String, TenantSmartFeature> existingMap = existing.stream()
                .filter(item -> StringUtils.hasText(item.getFeatureKey()))
                .collect(Collectors.toMap(TenantSmartFeature::getFeatureKey, item -> item, (a, b) -> a, LinkedHashMap::new));

        List<TenantSmartFeature> updates = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        for (String menuKey : MINIPROGRAM_MENU_KEYS) {
            TenantSmartFeature row = existingMap.get(menuKey);
            if (row == null) {
                row = new TenantSmartFeature();
                row.setTenantId(tenantId);
                row.setFeatureKey(menuKey);
                row.setCreateTime(now);
            }
            row.setEnabled(Boolean.TRUE.equals(nextFlags.get(menuKey)));
            row.setUpdateTime(now);
            updates.add(row);
        }

        tenantSmartFeatureService.saveOrUpdateBatch(updates);
        log.info("[TenantSmartFeature] 保存小程序菜单配置 tenantId={} count={}", tenantId, updates.size());
        return nextFlags;
    }

    private Map<String, Boolean> defaultFeatureFlags() {
        Map<String, Boolean> flags = new LinkedHashMap<>();
        for (String key : SUPPORTED_FEATURE_KEYS) {
            flags.put(key, false);
        }
        return flags;
    }

    private Map<String, Boolean> defaultMiniprogramMenuFlags() {
        Map<String, Boolean> flags = new LinkedHashMap<>();
        for (String key : MINIPROGRAM_MENU_KEYS) {
            flags.put(key, true);
        }
        return flags;
    }

    private void assertWritable() {
        if (UserContext.isSuperAdmin() || UserContext.isTopAdmin()) {
            return;
        }
        throw new IllegalArgumentException("仅租户管理员可修改智能开关");
    }
}
