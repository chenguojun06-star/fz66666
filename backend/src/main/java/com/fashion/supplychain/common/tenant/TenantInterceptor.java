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

    /** 不需要租户隔离的系统表（无 tenant_id 列） */
    private static final Set<String> EXCLUDED_TABLES = Set.of(
            "t_tenant", "t_permission", "t_role_permission", "t_login_log",
            "t_dict", "t_param_config", "t_serial_rule", "t_app_store",
            "t_tenant_permission_ceiling", "t_user_permission_override",
            "t_integration_callback_log",
            "t_cron_job"
    );

    /** 需要混合查询的表（租户数据 + 系统共享数据，用 tenant_id = X OR tenant_id IS NULL） */
    private static final Set<String> SHARED_TENANT_TABLES = Set.of(
            "t_role", "t_template_library", "t_template_operation_log"
    );

    /**
     * 超管可管理的表（有 tenant_id 列，但超管需要跨租户操作）。
     * 超管（tenantId=null）查询这些表时不追加 tenant_id IS NULL——
     * 否则审批入驻、创建账号等操作会因 IS NULL 过滤而无法读取新创建的记录。
     * 普通租户用户对这些表仍然按 tenant_id 隔离。
     *
     * 安全保障：超管只能通过"客户应用管理"模块操作这些表，
     * 不会看到生产订单/款式/财务等业务数据。
     */
    private static final Set<String> SUPERADMIN_MANAGED_TABLES = Set.of(
            "t_user", "t_app_order", "t_tenant_subscription",
            "t_payment_record", "t_logistics_record", "t_user_feedback",
            "t_tenant_billing", "t_billing_record", "t_plan_definition",
            "t_organization_unit" // 允许超管查看所有组织的架构
    );

    /** 匹配 FROM/JOIN/UPDATE/DELETE FROM 后表名的正则 */
    private static final Pattern TABLE_PATTERN = Pattern.compile(
            "(?:FROM|JOIN|UPDATE|DELETE\\s+FROM)\\s+([`]?\\w+[`]?)", Pattern.CASE_INSENSITIVE);

    @Override
    @SuppressWarnings("rawtypes")
    public void beforeQuery(Executor executor, MappedStatement ms, Object parameter,
                            RowBounds rowBounds, ResultHandler resultHandler, BoundSql boundSql) throws SQLException {
        if (isInterceptorIgnored(ms)) {
            log.debug("[TenantInterceptor] @InterceptorIgnore detected, skip tenant filtering for msId={}", ms.getId());
            return;
        }

        UserContext ctx = UserContext.get();
        if (ctx == null) {
            return;
        }

        Long tenantId = ctx.getTenantId();
        String originalSql = boundSql.getSql();

        // 超管判断：仅当 tenantId 为 null 时启用超管隔离模式（业务表返回空行）。
        // 超管登录到具体租户时（tenantId 非 null），按该租户身份查看业务数据，
        // 避免超管在租户下创建款式/订单后看不到自己创建的记录。
        boolean isSuperAdmin = tenantId == null;

        if (isSuperAdmin) {
            // 超级管理员分支
            if (shouldSkipSql(originalSql)) {
                return; // 系统共享表（EXCLUDED_TABLES）：放行
            }
            // 超管可管理的表（t_user/t_role 等）：放行——审批、创建账号需要跨租户操作
            if (involvesOnlySuperAdminTables(originalSql)) {
                return;
            }
            // 纯业务表（生产、款式、财务等）：追加 tenant_id IS NULL → 返回 0 行
            String blockedSql = addTenantIsNullFilter(originalSql);
            setFieldValue(boundSql, "sql", blockedSql);
            log.debug("[TenantInterceptor] 超管业务表查询已隔离（tenant_id IS NULL）");
            return;
        }

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
        if (isInterceptorIgnored(ms)) {
            return;
        }
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
     * 检查 MappedStatement 是否标注了 @InterceptorIgnore(tenantLine = "true")
     */
    private boolean isInterceptorIgnored(MappedStatement ms) {
        try {
            String msId = ms.getId();
            int dotIdx = msId.lastIndexOf('.');
            if (dotIdx < 0) return false;
            String className = msId.substring(0, dotIdx);
            String methodName = msId.substring(dotIdx + 1);
            Class<?> mapperClass = Class.forName(className);
            com.baomidou.mybatisplus.annotation.InterceptorIgnore classIgnore =
                    mapperClass.getAnnotation(com.baomidou.mybatisplus.annotation.InterceptorIgnore.class);
            if (classIgnore != null && "true".equals(classIgnore.tenantLine())) {
                return true;
            }
            for (java.lang.reflect.Method method : mapperClass.getMethods()) {
                if (method.getName().equals(methodName)) {
                    com.baomidou.mybatisplus.annotation.InterceptorIgnore ignore =
                            method.getAnnotation(com.baomidou.mybatisplus.annotation.InterceptorIgnore.class);
                    return ignore != null && "true".equals(ignore.tenantLine());
                }
            }
        } catch (ClassNotFoundException e) {
        }
        return false;
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
     * 判断 SQL 涉及的所有表是否都属于超管可管理范围
     * （SUPERADMIN_MANAGED_TABLES + SHARED_TENANT_TABLES + EXCLUDED_TABLES）。
     * 如果 SQL 涉及任何纯业务表（生产、款式、财务等），返回 false。
     */
    private boolean involvesOnlySuperAdminTables(String sql) {
        Matcher matcher = TABLE_PATTERN.matcher(sql);
        boolean hasTable = false;
        while (matcher.find()) {
            String tableName = matcher.group(1).replace("`", "").trim().toLowerCase();
            hasTable = true;
            if (!SUPERADMIN_MANAGED_TABLES.contains(tableName)
                    && !SHARED_TENANT_TABLES.contains(tableName)
                    && !EXCLUDED_TABLES.contains(tableName)) {
                return false; // 涉及业务表，不能放行
            }
        }
        return hasTable; // 所有表都在超管可管理范围内
    }

    /**
     * 为 SQL 追加租户过滤条件（子查询安全，仅在最外层插入）
     * <p>使用括号深度追踪，确保 ORDER BY/GROUP BY/LIMIT/WHERE 等关键字
     * 仅在最外层（depth=0）被识别，避免破坏子查询。</p>
     * @param isSharedTable 如果为 true，使用 (tenant_id = X OR tenant_id IS NULL) 来包含系统共享数据
     */
    private String addWhereCondition(String sql, Long tenantId, boolean isSharedTable) throws SQLException {
        if (tenantId == null) {
            return sql;
        }
        String tenantIdStr = String.valueOf(tenantId);
        if (!tenantIdStr.matches("\\d+")) {
            log.error("[TenantInterceptor] tenantId contains unexpected characters, rejecting request: {}", tenantId);
            throw new SQLException("租户标识异常，拒绝执行查询");
        }
        long tenantIdLong = Long.parseLong(tenantIdStr);
        String condition;
        if (isSharedTable) {
            condition = " AND (tenant_id = " + tenantIdLong + " OR tenant_id IS NULL)";
        } else {
            condition = " AND tenant_id = " + tenantIdLong;
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
            return sql.substring(0, insertPos) + " WHERE tenant_id = " + tenantIdStr + sql.substring(insertPos);
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

    /**
     * 超管业务表隔离：追加 WHERE tenant_id IS NULL
     * 业务数据全部有 tenant_id 值，IS NULL 过滤后有效返回 0 行，
     * 拒绝超管浏览任何租户的生产/款式/财务等业务数据。
     */
    private String addTenantIsNullFilter(String sql) {
        String condition = " AND tenant_id IS NULL";

        int orderByIdx = findFirstAtDepthZero(sql, " ORDER BY ");
        int groupByIdx = findFirstAtDepthZero(sql, " GROUP BY ");
        int havingIdx  = findFirstAtDepthZero(sql, " HAVING ");
        int limitIdx   = findFirstAtDepthZero(sql, " LIMIT ");

        int insertPos = sql.length();
        if (orderByIdx > 0) insertPos = Math.min(insertPos, orderByIdx);
        if (groupByIdx > 0) insertPos = Math.min(insertPos, groupByIdx);
        if (havingIdx  > 0) insertPos = Math.min(insertPos, havingIdx);
        if (limitIdx   > 0) insertPos = Math.min(insertPos, limitIdx);

        int whereIdx = findLastAtDepthZero(sql, " WHERE ");
        if (whereIdx >= 0 && whereIdx < insertPos) {
            return sql.substring(0, insertPos) + condition + sql.substring(insertPos);
        } else {
            return sql.substring(0, insertPos) + " WHERE tenant_id IS NULL" + sql.substring(insertPos);
        }
    }

    private Long getCurrentTenantId() {
        UserContext ctx = UserContext.get();
        if (ctx == null) {
            log.debug("[TenantInterceptor] UserContext is NULL - skip tenant filtering for non-request context");
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
