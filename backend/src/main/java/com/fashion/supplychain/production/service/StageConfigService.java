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

    /** 每租户独立快照：tenantId → (stageName → 生效配置) */
    private final ConcurrentHashMap<Long, Map<String, StageConfig>> perTenantSnapshot = new ConcurrentHashMap<>();

    /** 失效标记：tenantId → lastLoadTimestamp */
    private final ConcurrentHashMap<Long, Long> perTenantLoadedAt = new ConcurrentHashMap<>();

    /** Caffeine 空数据占位（避免短时间反复查 DB） */
    private final Cache<String, String> negativeCache = Caffeine.newBuilder()
            .maximumSize(2000)
            .expireAfterWrite(2, TimeUnit.MINUTES)
            .build();

    private static final long CACHE_TTL_MS = 10 * 60 * 1000L;

    @PostConstruct
    public void init() {
        log.info("StageConfigService 初始化完成（按租户隔离）");
    }

    /** 当前请求租户 */
    public Long currentTenantId() {
        UserContext ctx = UserContext.get();
        if (ctx == null || ctx.getTenantId() == null) {
            return -1L;
        }
        return ctx.getTenantId();
    }

    /** 失效当前/指定租户缓存 */
    public void reload() {
        reload(null);
    }

    public void reload(Long tenantId) {
        if (tenantId == null) {
            tenantId = currentTenantId();
        }
        if (tenantId != null) {
            perTenantSnapshot.remove(tenantId);
            perTenantLoadedAt.remove(tenantId);
        }
    }

    /** 获取全部生效环节配置（合并系统默认 + 租户覆盖），按固定顺序输出 */
    public List<StageConfig> getEffectiveConfigs() {
        Long tenantId = currentTenantId();
        Map<String, StageConfig> snap = loadForTenant(tenantId);
        List<StageConfig> result = new ArrayList<>();
        for (String stageName : StageConfigOrder.ORDER) {
            StageConfig cfg = snap.get(stageName);
            if (cfg != null) {
                result.add(cfg);
            }
        }
        return result;
    }

    /** 获取单个环节生效配置，无则返回 null */
    public StageConfig getEffectiveConfig(String stageName) {
        if (stageName == null || stageName.trim().isEmpty()) {
            return null;
        }
        Long tenantId = currentTenantId();
        return loadForTenant(tenantId).get(stageName.trim());
    }

    /**
     * 某环节是否配置了可操作人白名单，并校验指定操作员（id 优先，name 兜底）是否在内。
     *
     * @return null = 未配置白名单（所有人员可操作）；true = 允许；false = 拒绝
     */
    public Boolean isOperatorAllowed(String stageName, String operatorId, String operatorName) {
        StageConfig cfg = getEffectiveConfig(stageName);
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

    /** 加载指定租户生效配置（未命中或过期则实时查 DB 合并） */
    private Map<String, StageConfig> loadForTenant(Long tenantId) {
        Map<String, StageConfig> cached = perTenantSnapshot.get(tenantId);
        Long loadedAt = perTenantLoadedAt.get(tenantId);
        if (cached != null && loadedAt != null
                && System.currentTimeMillis() - loadedAt < CACHE_TTL_MS) {
            return cached;
        }
        QueryWrapper<StageConfig> wrapper = new QueryWrapper<>();
        wrapper.isNull("tenant_id").or().eq("tenant_id", tenantId);
        wrapper.orderByAsc("id");
        List<StageConfig> rows = mapper.selectList(wrapper);

        // 系统默认（tenant_id=NULL）
        Map<String, StageConfig> merged = new HashMap<>();
        for (StageConfig row : rows) {
            if (row.getStageName() == null) {
                continue;
            }
            if (row.getDeleteFlag() != null && row.getDeleteFlag() == 1) {
                continue;
            }
            String key = row.getStageName().trim();
            merged.putIfAbsent(key, row);
        }
        // 租户覆盖覆盖系统默认
        for (StageConfig row : rows) {
            if (row.getTenantId() != null && row.getTenantId().equals(tenantId)
                    && row.getStageName() != null) {
                String key = row.getStageName().trim();
                if (row.getDeleteFlag() == null || row.getDeleteFlag() != 1) {
                    merged.put(key, row);
                }
            }
        }
        perTenantSnapshot.put(tenantId, merged);
        perTenantLoadedAt.put(tenantId, System.currentTimeMillis());
        log.debug("租户 {} 环节配置缓存已加载: {} 条", tenantId, merged.size());
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