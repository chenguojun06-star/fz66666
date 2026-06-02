package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProcessParentMapping;
import com.fashion.supplychain.production.mapper.ProcessParentMappingMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * 父子工序映射服务 — 按租户隔离缓存
 *
 * 数据模型：
 *   tenant_id = NULL → 系统默认（所有租户共享）
 *   tenant_id = X    → 租户 X 私有覆盖
 *
 * 缓存策略：每租户一份 Map，缓存 10 分钟。
 * 失效时机：当前租户 POST/DELETE 一条配置时，清空该租户缓存；
 *          跨租户修改不影响其他租户的缓存。
 *
 * 调用方（如 ProcessParentNodeResolver）无需感知租户，service 内部从
 * UserContext.get().getTenantId() 拿到当前租户。
 */
@Slf4j
@Service
public class ProcessParentMappingService {

    @Autowired
    private ProcessParentMappingMapper mapper;

    /** 每租户独立缓存：tenantId → (keyword → parentNode) */
    private final ConcurrentHashMap<Long, Map<String, String>> perTenantSnapshot = new ConcurrentHashMap<>();

    /** 简单的失效标记：tenantId → lastLoadTimestamp（毫秒） */
    private final ConcurrentHashMap<Long, Long> perTenantLoadedAt = new ConcurrentHashMap<>();

    /** Caffeine 用作"空数据"占位（避免短时间内反复查 DB） */
    private final Cache<String, String> negativeCache = Caffeine.newBuilder()
            .maximumSize(2000)
            .expireAfterWrite(2, TimeUnit.MINUTES)
            .build();

    private static final long CACHE_TTL_MS = 10 * 60 * 1000L;

    @PostConstruct
    public void init() {
        log.info("ProcessParentMappingService 初始化完成（按租户隔离）");
    }

    /**
     * 失效当前租户缓存。Controller 的 add/delete 调这个。
     */
    public void reload() {
        reload(null);
    }

    /**
     * 失效指定租户的缓存（null = 当前请求租户）。
     * 删除某条系统默认（tenant_id=NULL）时，需要清空所有租户缓存。
     */
    public void reload(Long tenantId) {
        UserContext ctx = UserContext.get();
        if (tenantId == null && ctx != null) {
            tenantId = ctx.getTenantId();
        }
        if (tenantId != null) {
            perTenantSnapshot.remove(tenantId);
            perTenantLoadedAt.remove(tenantId);
        } else {
            // 系统默认被改：清空所有租户缓存
            perTenantSnapshot.clear();
            perTenantLoadedAt.clear();
        }
    }

    /**
     * 按当前租户获取完整映射表。线程安全，未命中则实时查 DB。
     */
    public Map<String, String> getAllMappings() {
        Long tenantId = currentTenantId();
        return loadForTenant(tenantId);
    }

    /**
     * 解析单个工序名→父节点。线程安全。
     */
    public String resolveParentNode(String processName) {
        if (processName == null || processName.trim().isEmpty()) {
            return null;
        }
        String pn = processName.trim();
        Long tenantId = currentTenantId();
        Map<String, String> snap = loadForTenant(tenantId);

        String exact = snap.get(pn);
        if (exact != null) {
            return exact;
        }

        // 最长关键词优先匹配
        String bestParent = null;
        int bestLen = 0;
        for (Map.Entry<String, String> entry : snap.entrySet()) {
            String keyword = entry.getKey();
            if (keyword.length() > bestLen && pn.contains(keyword)) {
                bestParent = entry.getValue();
                bestLen = keyword.length();
            }
        }
        return bestParent;
    }

    /**
     * 加载指定租户的缓存（未命中或过期则实时查 DB）。
     * 关键：Mapper 查询用 SHARED 模式，SQL 由 TenantInterceptor 自动追加
     * `WHERE (tenant_id = X OR tenant_id IS NULL)`。
     */
    private Map<String, String> loadForTenant(Long tenantId) {
        Map<String, String> cached = perTenantSnapshot.get(tenantId);
        Long loadedAt = perTenantLoadedAt.get(tenantId);
        if (cached != null && loadedAt != null
                && System.currentTimeMillis() - loadedAt < CACHE_TTL_MS) {
            return cached;
        }
        // 实时查 DB
        QueryWrapper<ProcessParentMapping> wrapper = new QueryWrapper<>();
        wrapper.isNull("tenant_id").or().eq("tenant_id", tenantId);
        wrapper.orderByAsc("id");
        List<ProcessParentMapping> rows = mapper.selectList(wrapper);

        Map<String, String> newMap = new HashMap<>();
        for (ProcessParentMapping m : rows) {
            if (m.getProcessKeyword() != null && m.getParentNode() != null) {
                // 同 key 时：租户级（tenantId=本租户）覆盖系统默认（tenantId=NULL）
                // 由于 ORDER BY id ASC，NULL（id 较大）会覆盖租户级（id 较小）？
                // 不对，租户级 id 一般 > NULL id。这里我们改成"租户级优先"：
                String existing = newMap.get(m.getProcessKeyword().trim());
                if (existing == null) {
                    newMap.put(m.getProcessKeyword().trim(), m.getParentNode().trim());
                } else if (m.getTenantId() != null && m.getTenantId().equals(tenantId)) {
                    // 当前租户的覆盖系统默认
                    newMap.put(m.getProcessKeyword().trim(), m.getParentNode().trim());
                }
            }
        }
        perTenantSnapshot.put(tenantId, newMap);
        perTenantLoadedAt.put(tenantId, System.currentTimeMillis());
        log.debug("租户 {} 父子工序缓存已加载: {} 条", tenantId, newMap.size());
        return newMap;
    }

    private Long currentTenantId() {
        UserContext ctx = UserContext.get();
        if (ctx == null || ctx.getTenantId() == null) {
            // 非请求上下文（定时任务等），给个特殊 key
            return -1L;
        }
        return ctx.getTenantId();
    }
}
