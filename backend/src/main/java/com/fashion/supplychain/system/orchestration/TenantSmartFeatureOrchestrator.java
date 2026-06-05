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
            "smart.material.purchase.ai.enabled",
            "print.hangtag.defaultTemplateId",
            "print.barcode.defaultTemplateId",
            "print.washLabel.defaultTemplateId",
            "print.codeType",
            "outstock.allowPriceAdjust",
            "outstock.priceAdjustRequireReason"
    );

    public static final List<String> MINIPROGRAM_MENU_KEYS = Arrays.asList(
            "miniprogram.menu.smartOps",
            "miniprogram.menu.dashboard",
            "miniprogram.menu.orderCreate",
            "miniprogram.menu.production",
            "miniprogram.menu.quality",
            "miniprogram.menu.bundleSplit",
            "miniprogram.menu.cuttingDetail",
            "miniprogram.menu.history",
            "miniprogram.menu.factoryShipment",
            "miniprogram.menu.advance",
            "miniprogram.menu.wagePayment"
    );

    public static final List<String> MINIPROGRAM_MENU_ROLES = Arrays.asList(
            "admin",
            "supervisor",
            "worker"
    );

    public static final Map<String, String> MENU_ROLE_LABELS = new LinkedHashMap<>() {{
        put("admin", "管理员");
        put("supervisor", "组长/主管");
        put("worker", "工人");
    }};

    public static final Map<String, String> MENU_KEY_LABELS = new LinkedHashMap<>() {{
        put("miniprogram.menu.smartOps", "运营看板");
        put("miniprogram.menu.dashboard", "生产管理");
        put("miniprogram.menu.orderCreate", "下单管理");
        put("miniprogram.menu.production", "质检通知");
        put("miniprogram.menu.quality", "生产扫码");
        put("miniprogram.menu.bundleSplit", "菲号单价");
        put("miniprogram.menu.cuttingDetail", "裁剪明细");
        put("miniprogram.menu.history", "扫码历史");
        put("miniprogram.menu.factoryShipment", "外发工厂");
        put("miniprogram.menu.advance", "员工借支");
        put("miniprogram.menu.wagePayment", "收付款中心");
    }};

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
        String role = resolveCurrentUserRole();
        try {
            Map<String, Boolean> flags = defaultMiniprogramMenuFlags();
            List<String> roleKeys = buildRoleSpecificKeys(role);
            List<TenantSmartFeature> rows = tenantSmartFeatureService.list(
                    new LambdaQueryWrapper<TenantSmartFeature>()
                            .eq(TenantSmartFeature::getTenantId, tenantId)
                            .in(TenantSmartFeature::getFeatureKey, roleKeys)
            );
            for (TenantSmartFeature row : rows) {
                if (StringUtils.hasText(row.getFeatureKey())) {
                    String menuKey = extractMenuKeyFromRoleKey(row.getFeatureKey());
                    if (menuKey != null) {
                        flags.put(menuKey, Boolean.TRUE.equals(row.getEnabled()));
                    }
                }
            }
            return flags;
        } catch (Exception e) {
            log.warn("[TenantSmartFeature] 查询小程序菜单配置失败，返回默认值 tenantId={}", tenantId, e);
            return defaultMiniprogramMenuFlags();
        }
    }

    public Map<String, Map<String, Boolean>> listMiniprogramMenuFlagsByRole() {
        Long tenantId = UserContext.tenantId();
        Map<String, Map<String, Boolean>> result = new LinkedHashMap<>();
        for (String role : MINIPROGRAM_MENU_ROLES) {
            result.put(role, defaultMiniprogramMenuFlags());
        }
        if (tenantId == null) {
            return result;
        }
        try {
            List<String> allRoleKeys = new ArrayList<>();
            for (String role : MINIPROGRAM_MENU_ROLES) {
                allRoleKeys.addAll(buildRoleSpecificKeys(role));
            }
            List<TenantSmartFeature> rows = tenantSmartFeatureService.list(
                    new LambdaQueryWrapper<TenantSmartFeature>()
                            .eq(TenantSmartFeature::getTenantId, tenantId)
                            .in(TenantSmartFeature::getFeatureKey, allRoleKeys)
            );
            for (TenantSmartFeature row : rows) {
                if (!StringUtils.hasText(row.getFeatureKey())) continue;
                ParsedRoleKey parsed = parseRoleKey(row.getFeatureKey());
                if (parsed == null) continue;
                Map<String, Boolean> roleFlags = result.get(parsed.role);
                if (roleFlags != null) {
                    roleFlags.put(parsed.menuKey, Boolean.TRUE.equals(row.getEnabled()));
                }
            }
            return result;
        } catch (Exception e) {
            log.warn("[TenantSmartFeature] 查询按角色菜单配置失败 tenantId={}", tenantId, e);
            return result;
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Map<String, Boolean>> saveMiniprogramMenuFlagsByRole(Map<String, Map<String, Boolean>> roleMenus) {
        TenantAssert.assertTenantContext();
        assertWritable();
        Long tenantId = TenantAssert.requireTenantId();

        List<String> allRoleKeys = new ArrayList<>();
        for (String role : MINIPROGRAM_MENU_ROLES) {
            allRoleKeys.addAll(buildRoleSpecificKeys(role));
        }

        List<TenantSmartFeature> existing = tenantSmartFeatureService.list(
                new LambdaQueryWrapper<TenantSmartFeature>()
                        .eq(TenantSmartFeature::getTenantId, tenantId)
                        .in(TenantSmartFeature::getFeatureKey, allRoleKeys)
        );
        Map<String, TenantSmartFeature> existingMap = existing.stream()
                .filter(item -> StringUtils.hasText(item.getFeatureKey()))
                .collect(Collectors.toMap(TenantSmartFeature::getFeatureKey, item -> item, (a, b) -> a, LinkedHashMap::new));

        List<TenantSmartFeature> updates = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        for (String role : MINIPROGRAM_MENU_ROLES) {
            Map<String, Boolean> menuFlags = (roleMenus != null && roleMenus.containsKey(role))
                    ? roleMenus.get(role) : null;
            for (String menuKey : MINIPROGRAM_MENU_KEYS) {
                String roleKey = buildRoleSpecificKey(menuKey, role);
                boolean enabled;
                if (menuFlags != null && menuFlags.containsKey(menuKey)) {
                    enabled = Boolean.TRUE.equals(menuFlags.get(menuKey));
                } else {
                    TenantSmartFeature existingRow = existingMap.get(roleKey);
                    enabled = existingRow != null ? Boolean.TRUE.equals(existingRow.getEnabled()) : true;
                }
                TenantSmartFeature row = existingMap.get(roleKey);
                if (row == null) {
                    row = new TenantSmartFeature();
                    row.setTenantId(tenantId);
                    row.setFeatureKey(roleKey);
                    row.setCreateTime(now);
                }
                row.setEnabled(enabled);
                row.setUpdateTime(now);
                updates.add(row);
            }
        }

        tenantSmartFeatureService.saveOrUpdateBatch(updates);
        log.info("[TenantSmartFeature] 保存按角色菜单配置 tenantId={} count={}", tenantId, updates.size());
        return listMiniprogramMenuFlagsByRole();
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

        String role = resolveCurrentUserRole();
        List<String> roleKeys = buildRoleSpecificKeys(role);

        List<TenantSmartFeature> existing = tenantSmartFeatureService.list(
                new LambdaQueryWrapper<TenantSmartFeature>()
                        .eq(TenantSmartFeature::getTenantId, tenantId)
                        .in(TenantSmartFeature::getFeatureKey, roleKeys)
        );
        Map<String, TenantSmartFeature> existingMap = existing.stream()
                .filter(item -> StringUtils.hasText(item.getFeatureKey()))
                .collect(Collectors.toMap(TenantSmartFeature::getFeatureKey, item -> item, (a, b) -> a, LinkedHashMap::new));

        List<TenantSmartFeature> updates = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        for (String menuKey : MINIPROGRAM_MENU_KEYS) {
            String roleKey = buildRoleSpecificKey(menuKey, role);
            boolean enabled = Boolean.TRUE.equals(nextFlags.get(menuKey));
            TenantSmartFeature row = existingMap.get(roleKey);
            if (row == null) {
                row = new TenantSmartFeature();
                row.setTenantId(tenantId);
                row.setFeatureKey(roleKey);
                row.setCreateTime(now);
            }
            row.setEnabled(enabled);
            row.setUpdateTime(now);
            updates.add(row);
        }

        tenantSmartFeatureService.saveOrUpdateBatch(updates);
        log.info("[TenantSmartFeature] 保存小程序菜单配置 tenantId={} role={} count={}", tenantId, role, updates.size());
        return nextFlags;
    }

    private String resolveCurrentUserRole() {
        if (UserContext.isTopAdmin()) return "admin";
        if (UserContext.isSupervisorOrAbove()) return "supervisor";
        return "worker";
    }

    private List<String> buildRoleSpecificKeys(String role) {
        List<String> keys = new ArrayList<>();
        for (String menuKey : MINIPROGRAM_MENU_KEYS) {
            keys.add(buildRoleSpecificKey(menuKey, role));
        }
        return keys;
    }

    private String buildRoleSpecificKey(String menuKey, String role) {
        return menuKey + ".role." + role;
    }

    private String extractMenuKeyFromRoleKey(String roleKey) {
        int idx = roleKey.indexOf(".role.");
        return idx > 0 ? roleKey.substring(0, idx) : null;
    }

    private ParsedRoleKey parseRoleKey(String roleKey) {
        int idx = roleKey.indexOf(".role.");
        if (idx <= 0) return null;
        String menuKey = roleKey.substring(0, idx);
        String role = roleKey.substring(idx + 6);
        if (!MINIPROGRAM_MENU_KEYS.contains(menuKey) || !MINIPROGRAM_MENU_ROLES.contains(role)) return null;
        return new ParsedRoleKey(menuKey, role);
    }

    private static class ParsedRoleKey {
        final String menuKey;
        final String role;
        ParsedRoleKey(String menuKey, String role) {
            this.menuKey = menuKey;
            this.role = role;
        }
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
