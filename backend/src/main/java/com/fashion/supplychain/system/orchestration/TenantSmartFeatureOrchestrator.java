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
import java.util.Objects;
import java.util.Set;
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

    @Autowired
    private TenantSmartFeatureService tenantSmartFeatureService;

    public Map<String, Boolean> listCurrentTenantFeatures() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return defaultFeatureFlags();
        }
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

    private Map<String, Boolean> defaultFeatureFlags() {
        Map<String, Boolean> flags = new LinkedHashMap<>();
        for (String key : SUPPORTED_FEATURE_KEYS) {
            flags.put(key, false);
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