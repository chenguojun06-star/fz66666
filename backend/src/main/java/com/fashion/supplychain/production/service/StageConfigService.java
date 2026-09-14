package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.StageConfig;
import com.fashion.supplychain.production.mapper.StageConfigMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * 生产环节配置服务 — 按租户隔离缓存（镜像 ProcessParentMappingService）
 *
 * 数据模型：
 *   tenant_id = NULL → 系统默认（所有租户共享的兜底配置）
 *   tenant_id = X    → 租户 X 私有覆盖
 *
 * 合并规则：租户级覆盖系统默认。可操作人/预计时长以"生效配置"为准。
 * 缓存策略：每租户一份快照，缓存 10 分钟；修改当前租户配置时清空该租户缓存。
 */
@Slf4j
@Service
public class StageConfigService {

    @Autowired
    private StageConfigMapper mapper;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 每 (租户,款式) 独立快照：cacheKey → (stageName → 生效配置) */
    private final ConcurrentHashMap<String, Map<String, StageConfig>> perStyleSnapshot = new ConcurrentHashMap<>();

    /** 失效标记：cacheKey → lastLoadTimestamp */
    private final ConcurrentHashMap<String, Long> perStyleLoadedAt = new ConcurrentHashMap<>();

    /** Caffeine 空数据占位（避免短时间反复查 DB） */
    private final Cache<String, String> negativeCache = Caffeine.newBuilder()
            .maximumSize(2000)
            .expireAfterWrite(2, TimeUnit.MINUTES)
            .build();

    private static final long CACHE_TTL_MS = 10 * 60 * 1000L;

    @PostConstruct
    public void init() {
        log.info("StageConfigService 初始化完成（按租户+款式隔离）");
    }

    /** 当前请求租户 */
    public Long currentTenantId() {
        UserContext ctx = UserContext.get();
        if (ctx == null || ctx.getTenantId() == null) {
            return -1L;
        }
        return ctx.getTenantId();
    }

    /** 缓存键：tenantId:styleId（styleId 空串=基线） */
    private static String cacheKey(Long tenantId, String styleId) {
        return tenantId + ":" + (styleId == null ? "" : styleId.trim());
    }

    /** 失效指定租户+款式的缓存；两者皆可空（空 = 当前租户 / 仅基线） */
    public void reload() {
        reload(null, null);
    }

    public void reload(Long tenantId) {
        reload(tenantId, null);
    }

    public void reload(Long tenantId, String styleId) {
        if (tenantId == null) {
            tenantId = currentTenantId();
        }
        if (tenantId != null) {
            perStyleSnapshot.remove(cacheKey(tenantId, styleId));
            perStyleLoadedAt.remove(cacheKey(tenantId, styleId));
        }
    }

    /** 获取全部生效环节配置（合并基线 + 款式覆盖），按固定顺序输出 */
    public List<StageConfig> getEffectiveConfigs(String styleId) {
        Long tenantId = currentTenantId();
        Map<String, StageConfig> snap = loadForTenant(tenantId, styleId);
        List<StageConfig> result = new ArrayList<>();
        for (String stageName : StageConfigOrder.ORDER) {
            StageConfig cfg = snap.get(stageName);
            if (cfg != null) {
                result.add(cfg);
            }
        }
        return result;
    }

    /** 获取单个环节生效配置（styleId 空 → 仅基线），无则返回 null */
    public StageConfig getEffectiveConfig(String stageName, String styleId) {
        if (stageName == null || stageName.trim().isEmpty()) {
            return null;
        }
        Long tenantId = currentTenantId();
        return loadForTenant(tenantId, styleId).get(stageName.trim());
    }

    /**
     * 某环节是否配置了可操作人白名单，并校验指定操作员（id 优先，name 兜底）是否在内。
     *
     * @return null = 未配置白名单（所有人员可操作）；true = 允许；false = 拒绝
     */
    public Boolean isOperatorAllowed(String stageName, String styleId, String operatorId, String operatorName) {
        StageConfig cfg = getEffectiveConfig(stageName, styleId);
        if (cfg == null || !hasText(cfg.getOperatorsJson())) {
            return null; // 未配置可操作人 → 全员可操作
        }
        List<Map<String, String>> operators = parseOperators(cfg.getOperatorsJson());
        if (operators.isEmpty()) {
            return null;
        }
        for (Map<String, String> op : operators) {
            String id = trim(op.get("id"));
            String name = trim(op.get("name"));
            if (id != null && id.equals(trim(operatorId))) {
                return true;
            }
            if (name != null && !name.isEmpty() && name.equals(trim(operatorName))) {
                return true;
            }
        }
        return false;
    }

    /** 解析可操作人 JSON → [{id,name}]，JSON 异常时返回空列表（视作全员可操作，不抛阻断） */
    public List<Map<String, String>> parseOperators(String operatorsJson) {
        List<Map<String, String>> result = new ArrayList<>();
        if (!hasText(operatorsJson)) {
            return result;
        }
        try {
            result = objectMapper.readValue(operatorsJson, new TypeReference<List<Map<String, String>>>() {});
        } catch (Exception e) {
            log.warn("[StageConfig] 解析可操作人失败，视作未配置: {}", e.getMessage());
            result = new ArrayList<>();
        }
        return result;
    }

    /** 清空指定租户下全部款式缓存（含基线） */
    public void reloadAllTenant(Long tenantId) {
        if (tenantId == null) {
            return;
        }
        String prefix = tenantId + ":";
        perStyleSnapshot.keySet().removeIf(k -> k.startsWith(prefix));
        perStyleLoadedAt.keySet().removeIf(k -> k.startsWith(prefix));
    }

    /**
     * 加载指定 (租户,款式) 生效配置（未命中或过期则实时查 DB 合并）。
     * 合并顺序：系统默认（tenant NULL + style 空）→ 租户基线（tenant X + style 空）→ 款式覆盖（tenant X + style = styleId）。
     */
    private Map<String, StageConfig> loadForTenant(Long tenantId, String styleId) {
        String style = styleId == null ? "" : styleId.trim();
        String key = cacheKey(tenantId, style);
        Map<String, StageConfig> cached = perStyleSnapshot.get(key);
        Long loadedAt = perStyleLoadedAt.get(key);
        if (cached != null && loadedAt != null
                && System.currentTimeMillis() - loadedAt < CACHE_TTL_MS) {
            return cached;
        }
        QueryWrapper<StageConfig> wrapper = new QueryWrapper<>();
        // 系统默认基线(tenant NULL)+本租户基线(style 空)+本租户款式覆盖(style=styleId)
        wrapper.and(w -> w.and(t -> t.isNull("tenant_id").eq("style_id", ""))
                        .or(e -> e.eq("tenant_id", tenantId).eq("style_id", ""))
                        .or(e -> e.eq("tenant_id", tenantId).eq("style_id", style)));
        wrapper.orderByAsc("id");
        List<StageConfig> rows = mapper.selectList(wrapper);

        Map<String, StageConfig> merged = new HashMap<>();
        // 1) 系统默认（tenant_id=NULL）
        for (StageConfig row : rows) {
            if (row.getStageName() == null || (row.getDeleteFlag() != null && row.getDeleteFlag() == 1)) {
                continue;
            }
            if (row.getTenantId() == null) {
                merged.putIfAbsent(row.getStageName().trim(), row);
            }
        }
        // 2) 本租户基线（tenant X + style 空）
        for (StageConfig row : rows) {
            if (row.getStageName() == null || (row.getDeleteFlag() != null && row.getDeleteFlag() == 1)) {
                continue;
            }
            if (row.getTenantId() != null && row.getTenantId().equals(tenantId)
                    && !hasText(row.getStyleId())) {
                merged.put(row.getStageName().trim(), row);
            }
        }
        // 3) 款式覆盖（tenant X + style = styleId）
        if (hasText(style)) {
            for (StageConfig row : rows) {
                if (row.getStageName() == null || (row.getDeleteFlag() != null && row.getDeleteFlag() == 1)) {
                    continue;
                }
                if (row.getTenantId() != null && row.getTenantId().equals(tenantId)
                        && hasText(row.getStyleId()) && row.getStyleId().trim().equals(style)) {
                    merged.put(row.getStageName().trim(), row);
                }
            }
        }
        perStyleSnapshot.put(key, merged);
        perStyleLoadedAt.put(key, System.currentTimeMillis());
        log.debug("租户 {} 款式 {} 环节配置缓存已加载: {} 条", tenantId, style.isEmpty() ? "(基线)" : style, merged.size());
        return merged;
    }

    private boolean hasText(String s) {
        return s != null && !s.trim().isEmpty();
    }

    private String trim(String s) {
        return s == null ? null : s.trim();
    }

    /** 固定环节展示顺序 */
    public static final class StageConfigOrder {
        public static final List<String> ORDER = java.util.Collections.unmodifiableList(
                java.util.Arrays.asList("采购", "裁剪", "二次工艺", "车缝", "尾部", "入库"));
    }

    public static BigDecimal toDays(Object v) {
        if (v == null) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(v.toString());
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }
}