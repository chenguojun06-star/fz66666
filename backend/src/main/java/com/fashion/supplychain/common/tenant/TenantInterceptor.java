package com.fashion.supplychain.common.tenant;

import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import com.baomidou.mybatisplus.extension.plugins.inner.InnerInterceptor;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.SqlCommandType;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;

import java.sql.SQLException;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 多租户数据隔离拦截器（MyBatis-Plus InnerInterceptor）
 *
 * 核心机制：
 * 1. SELECT/UPDATE/DELETE：自动追加 WHERE tenant_id = #{currentTenantId}
 * 2. INSERT：通过 MyBatis-Plus 的自动填充机制设置 tenant_id（见 TenantMetaObjectHandler）
 * 3. 超级管理员（tenantId=null）绕过所有租户过滤
 *
 * 排除表（不需要租户隔离的系统表）：
 * - t_tenant, t_role, t_permission, t_role_permission, t_login_log, t_dict
 */
@Slf4j
public class TenantInterceptor implements InnerInterceptor {

    /** 不需要租户隔离的系统表 */
    private static final Set<String> EXCLUDED_TABLES = new HashSet<>();

    /** 需要混合查询的表（租户数据 + 系统共享数据，用 tenant_id = X OR tenant_id IS NULL） */
    private static final Set<String> SHARED_TENANT_TABLES = new HashSet<>();

    /** 匹配 FROM/JOIN/UPDATE/DELETE FROM 后表名的正则 */
    private static final Pattern TABLE_PATTERN = Pattern.compile(
            "(?:FROM|JOIN|UPDATE|DELETE\\s+FROM)\\s+([`]?\\w+[`]?)", Pattern.CASE_INSENSITIVE);

    static {
        // === 系统共享表（无 tenant_id 列的表）===
        EXCLUDED_TABLES.add("t_tenant");
        EXCLUDED_TABLES.add("t_permission");
        EXCLUDED_TABLES.add("t_role_permission");
        EXCLUDED_TABLES.add("t_login_log");
        EXCLUDED_TABLES.add("t_dict");
        EXCLUDED_TABLES.add("t_param_config");
        EXCLUDED_TABLES.add("t_serial_rule");
        EXCLUDED_TABLES.add("t_app_store");             // 应用商店（无 tenant_id 列）
        EXCLUDED_TABLES.add("t_pattern_scan_record");    // 版型扫码记录（无 tenant_id 列）

        // === 权限相关表（跨租户共享权限定义）===
        EXCLUDED_TABLES.add("t_tenant_permission_ceiling");
        EXCLUDED_TABLES.add("t_user_permission_override");

        // ⚠️ v_production_order_* 视图已添加 tenant_id 列，由拦截器自动过滤，不再排除
        // ⚠️ v_finished_product_settlement 已移除排除列表：该视图有 tenant_id 列，必须租户隔离
        // EXCLUDED_TABLES.add("v_finished_product_settlement");

        // ⚠️ t_role 已从排除列表移除 — 角色需要租户隔离（租户角色有 tenant_id）
        // ⚠️ t_user 已从排除列表移除 — 用户需要租户隔离

        // === 混合表（租户自有数据 + 系统共享数据）===
        SHARED_TENANT_TABLES.add("t_role");              // 系统模板角色(tenant_id=NULL) + 租户自有角色
        SHARED_TENANT_TABLES.add("t_template_library");  // 系统工序模板(NULL) + 租户自定义模板
        SHARED_TENANT_TABLES.add("t_template_operation_log"); // 模板操作日志
    }

    @Override
    public void beforeQuery(Executor executor, MappedStatement ms, Object parameter,
                            RowBounds rowBounds, ResultHandler resultHandler, BoundSql boundSql) throws SQLException {
        Long tenantId = getCurrentTenantId();
        if (tenantId == null) {
            // 超级管理员或未登录，不过滤
            return;
        }

        String originalSql = boundSql.getSql();
        if (shouldSkipSql(originalSql)) {
            return;
        }

        // 检查是否涉及混合表（需要 OR tenant_id IS NULL）
        boolean isSharedTable = involvesSharedTable(originalSql);
        String newSql = addWhereCondition(originalSql, tenantId, isSharedTable);
        if (!newSql.equals(originalSql)) {
            setFieldValue(boundSql, "sql", newSql);
            log.debug("Tenant SELECT filter applied: tenantId={}, shared={}", tenantId, isSharedTable);
        }
    }

    @Override
    public void beforeUpdate(Executor executor, MappedStatement ms, Object parameter) throws SQLException {
        Long tenantId = getCurrentTenantId();
        if (tenantId == null) {
            return;
        }

        SqlCommandType type = ms.getSqlCommandType();
        if (type == SqlCommandType.INSERT) {
            // INSERT 通过 MetaObjectHandler 自动填充 tenant_id
            return;
        }

        // UPDATE / DELETE 追加 tenant_id 条件（混合表不需要 OR NULL，只操作自己的数据）
        BoundSql boundSql = ms.getBoundSql(parameter);
        String originalSql = boundSql.getSql();

        if (shouldSkipSql(originalSql)) {
            return;
        }

        String newSql = addWhereCondition(originalSql, tenantId, false);
        if (!newSql.equals(originalSql)) {
            setFieldValue(boundSql, "sql", newSql);
            log.debug("Tenant {} filter applied: tenantId={}", type, tenantId);
        }
    }

    /**
     * 判断 SQL 是否涉及排除的系统表
     */
    private boolean shouldSkipSql(String sql) {
        if (sql == null || sql.isBlank()) return true;
        Matcher matcher = TABLE_PATTERN.matcher(sql);
        while (matcher.find()) {
            String tableName = matcher.group(1).replace("`", "").trim().toLowerCase();
            if (!EXCLUDED_TABLES.contains(tableName)) {
                // 至少有一个非排除表，需要过滤
                return false;
            }
        }
        // 所有表都是排除表，或无法解析 → 跳过
        return true;
    }

    /**
     * 判断 SQL 是否涉及混合表（需要 OR tenant_id IS NULL）
     */
    private boolean involvesSharedTable(String sql) {
        Matcher matcher = TABLE_PATTERN.matcher(sql);
        while (matcher.find()) {
            String tableName = matcher.group(1).replace("`", "").trim().toLowerCase();
            if (SHARED_TENANT_TABLES.contains(tableName)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 为 SQL 追加租户过滤条件（子查询安全，仅在最外层插入）
     * <p>使用括号深度追踪，确保 ORDER BY/GROUP BY/LIMIT/WHERE 等关键字
     * 仅在最外层（depth=0）被识别，避免破坏子查询。</p>
     * @param isSharedTable 如果为 true，使用 (tenant_id = X OR tenant_id IS NULL) 来包含系统共享数据
     */
    private String addWhereCondition(String sql, Long tenantId, boolean isSharedTable) {
        String condition;
        if (isSharedTable) {
            condition = " AND (tenant_id = " + tenantId + " OR tenant_id IS NULL)";
        } else {
            condition = " AND tenant_id = " + tenantId;
        }

        // 使用深度感知查找，只匹配最外层关键字（忽略子查询内部的）
        int orderByIdx = findFirstAtDepthZero(sql, " ORDER BY ");
        int groupByIdx = findFirstAtDepthZero(sql, " GROUP BY ");
        int havingIdx = findFirstAtDepthZero(sql, " HAVING ");
        int limitIdx = findFirstAtDepthZero(sql, " LIMIT ");

        // 找到最外层最早出现的结束关键字位置
        int insertPos = sql.length(); // 默认插入到末尾
        if (orderByIdx > 0) insertPos = Math.min(insertPos, orderByIdx);
        if (groupByIdx > 0) insertPos = Math.min(insertPos, groupByIdx);
        if (havingIdx > 0) insertPos = Math.min(insertPos, havingIdx);
        if (limitIdx > 0) insertPos = Math.min(insertPos, limitIdx);

        int whereIdx = findLastAtDepthZero(sql, " WHERE ");
        if (whereIdx >= 0 && whereIdx < insertPos) {
            // 已有外层 WHERE，在外层结束关键字前插入 AND condition
            return sql.substring(0, insertPos) + condition + sql.substring(insertPos);
        } else {
            // 无外层 WHERE，在外层结束关键字前插入 WHERE tenant_id = X
            return sql.substring(0, insertPos) + " WHERE tenant_id = " + tenantId + sql.substring(insertPos);
        }
    }

    /**
     * 在 SQL 中查找第一个 depth=0（不在括号内）的关键字位置
     * @return 关键字起始位置，未找到返回 -1
     */
    private int findFirstAtDepthZero(String sql, String keyword) {
        String upperSql = sql.toUpperCase();
        String upperKeyword = keyword.toUpperCase();
        int depth = 0;
        int maxStart = upperSql.length() - upperKeyword.length();
        for (int i = 0; i <= maxStart; i++) {
            char c = sql.charAt(i);
            if (c == '(') { depth++; continue; }
            if (c == ')') { depth--; continue; }
            if (depth == 0 && upperSql.startsWith(upperKeyword, i)) {
                return i;
            }
        }
        return -1;
    }

    /**
     * 在 SQL 中查找最后一个 depth=0（不在括号内）的关键字位置
     * @return 关键字起始位置，未找到返回 -1
     */
    private int findLastAtDepthZero(String sql, String keyword) {
        String upperSql = sql.toUpperCase();
        String upperKeyword = keyword.toUpperCase();
        int depth = 0;
        int lastFound = -1;
        int maxStart = upperSql.length() - upperKeyword.length();
        for (int i = 0; i <= maxStart; i++) {
            char c = sql.charAt(i);
            if (c == '(') { depth++; continue; }
            if (c == ')') { depth--; continue; }
            if (depth == 0 && upperSql.startsWith(upperKeyword, i)) {
                lastFound = i;
            }
        }
        return lastFound;
    }

    private Long getCurrentTenantId() {
        UserContext ctx = UserContext.get();
        if (ctx == null) {
            log.warn("[TenantInterceptor] UserContext is NULL - no tenant filtering");
            return null;
        }
        Long tenantId = ctx.getTenantId();
        log.debug("[TenantInterceptor] Current tenantId={}, userId={}", tenantId, ctx.getUserId());
        return tenantId;
    }

    private void setFieldValue(Object obj, String fieldName, Object value) {
        try {
            java.lang.reflect.Field field = obj.getClass().getDeclaredField(fieldName);
            field.setAccessible(true);
            field.set(obj, value);
        } catch (Exception e) {
            log.error("Failed to set field value: {}", fieldName, e);
        }
    }
}
