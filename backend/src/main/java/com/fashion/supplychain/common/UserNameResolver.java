package com.fashion.supplychain.common;

import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * D-359 操作人显示名统一解析器：账号/用户ID → 姓名。
 *
 * <p>背景：历史链路把 {@code UserContext.username()}（登录账号，如 lilb）直接写进了各业务的
 * operatorName 字段，导致同一列"有时显示姓名、有时显示账号"。本解析器在**读取链路**统一把
 * 账号/用户ID 解析成 t_user.name，新老数据一起生效，无需数据回填。</p>
 *
 * <p>性能：结果进内存缓存（TTL 10 分钟），批量解析一次查询取回，避免逐行查库拖慢扫码/结算页。</p>
 */
@Component
@RequiredArgsConstructor
public class UserNameResolver {

    private static final Logger log = LoggerFactory.getLogger(UserNameResolver.class);
    private static final long TTL_MS = 10 * 60 * 1000L;

    private final UserMapper userMapper;

    /** key = tenantId|identifier(账号或用户ID) → [name, cachedAt] */
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    private static final class CacheEntry {
        final String name;
        final long at;
        CacheEntry(String name, long at) { this.name = name; this.at = at; }
        boolean fresh() { return System.currentTimeMillis() - at < TTL_MS; }
    }

    /**
     * 解析单个：identifier 可以是用户ID（Long 字符串）或登录账号 username。
     * 解析不到时原样返回（不吞掉信息），空值返回空。
     */
    public String resolveDisplayName(String identifier) {
        String id = StringUtils.hasText(identifier) ? identifier.trim() : null;
        if (id == null) return identifier;
        Long tenantId = UserContext.tenantId();
        String key = (tenantId == null ? "0" : tenantId) + "|" + id;
        CacheEntry hit = cache.get(key);
        if (hit != null && hit.fresh()) return hit.name;

        String name = id;
        try {
            User user = userMapper.selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<User>()
                    .eq(User::getTenantId, tenantId)
                    .and(w -> w.eq(User::getUsername, id).or().eq(User::getId, id))
                    .select(User::getName, User::getUsername, User::getId)
                    .last("limit 1"));
            if (user != null && StringUtils.hasText(user.getName())) {
                name = user.getName();
            }
        } catch (Exception e) {
            log.debug("[UserNameResolver] 解析失败, 原样返回: id={}, err={}", id, e.getMessage());
        }
        cache.put(key, new CacheEntry(name, System.currentTimeMillis()));
        return name;
    }

    /** 批量解析（一次查库），供列表渲染使用；入参为账号或用户ID 的集合 */
    public Map<String, String> resolveDisplayNames(java.util.Collection<String> identifiers) {
        Map<String, String> result = new java.util.HashMap<>();
        if (identifiers == null || identifiers.isEmpty()) return result;
        List<String> distinct = identifiers.stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
        if (distinct.isEmpty()) return result;

        Long tenantId = UserContext.tenantId();
        java.util.List<String> misses = distinct.stream().filter(id -> {
            CacheEntry hit = cache.get((tenantId == null ? "0" : tenantId) + "|" + id);
            if (hit != null && hit.fresh()) { result.put(id, hit.name); return false; }
            return true;
        }).collect(Collectors.toList());

        if (!misses.isEmpty()) {
            try {
                List<User> users = userMapper.selectList(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<User>()
                        .eq(User::getTenantId, tenantId)
                        .and(w -> w.in(User::getUsername, misses).or().in(User::getId, misses))
                        .select(User::getName, User::getUsername, User::getId));
                Map<String, String> byUsername = users.stream()
                        .filter(u -> StringUtils.hasText(u.getUsername()) && StringUtils.hasText(u.getName()))
                        .collect(Collectors.toMap(User::getUsername, User::getName, (a, b) -> a));
                Map<String, String> byId = users.stream()
                        .filter(u -> u.getId() != null && StringUtils.hasText(u.getName()))
                        .collect(Collectors.toMap(u -> String.valueOf(u.getId()), User::getName, (a, b) -> a));
                for (String id : misses) {
                    String name = byId.getOrDefault(id, byUsername.get(id));
                    if (name == null) name = id; // 解析不到原样返回
                    cache.put((tenantId == null ? "0" : tenantId) + "|" + id, new CacheEntry(name, System.currentTimeMillis()));
                    result.put(id, name);
                }
            } catch (Exception e) {
                log.debug("[UserNameResolver] 批量解析失败, 原样返回: err={}", e.getMessage());
                misses.forEach(id -> result.put(id, id));
            }
        }
        return result;
    }

    /** 便捷：把一批记录的 operatorId/operatorName 统一解析成姓名（取 operatorId 优先） */
    public <T> void normalizeOperatorNames(List<T> rows,
                                           Function<T, String> idGetter,
                                           Function<T, String> nameGetter,
                                           java.util.function.BiConsumer<T, String> setter) {
        if (rows == null || rows.isEmpty()) return;
        Map<String, String> pool = resolveDisplayNames(rows.stream()
                .map(r -> {
                    String id = idGetter.apply(r);
                    return StringUtils.hasText(id) ? id : nameGetter.apply(r);
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toList()));
        for (T row : rows) {
            String id = idGetter.apply(row);
            String key = StringUtils.hasText(id) ? id.trim() : StringUtils.trimWhitespace(nameGetter.apply(row));
            if (!StringUtils.hasText(key)) continue;
            String resolved = pool.get(key);
            if (StringUtils.hasText(resolved)) setter.accept(row, resolved);
        }
    }
}
