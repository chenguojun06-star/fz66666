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

    /** 匹配 FROM/JOIN 后表名的正则 */
    private static final Pattern TABLE_PATTERN = Pattern.compile(
            "(?:FROM|JOIN)\\s+([`]?\\w+[`]?)", Pattern.CASE_INSENSITIVE);

    static {
        EXCLUDED_TABLES.add("t_tenant");
        EXCLUDED_TABLES.add("t_role");
        EXCLUDED_TABLES.add("t_permission");
        EXCLUDED_TABLES.add("t_role_permission");
        EXCLUDED_TABLES.add("t_login_log");
        EXCLUDED_TABLES.add("t_dict");
        EXCLUDED_TABLES.add("t_param_config");
        EXCLUDED_TABLES.add("t_serial_rule");
        EXCLUDED_TABLES.add("t_user");
        EXCLUDED_TABLES.add("t_tenant_permission_ceiling");
        EXCLUDED_TABLES.add("t_user_permission_override");
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

        // 使用子查询包裹方式，兼容所有 SQL 结构
        String newSql = "SELECT * FROM (" + originalSql + ") _t WHERE _t.tenant_id = " + tenantId;
        setFieldValue(boundSql, "sql", newSql);
        log.debug("Tenant SELECT filter applied: tenantId={}", tenantId);
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

        // UPDATE / DELETE 追加 tenant_id 条件
        BoundSql boundSql = ms.getBoundSql(parameter);
        String originalSql = boundSql.getSql();

        if (shouldSkipSql(originalSql)) {
            return;
        }

        String newSql = addWhereCondition(originalSql, tenantId);
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
        String upperSql = sql.toUpperCase();
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
     * 为 UPDATE/DELETE SQL 追加 AND tenant_id = ?
     */
    private String addWhereCondition(String sql, Long tenantId) {
        String upperSql = sql.toUpperCase();
        String condition = " tenant_id = " + tenantId;

        int whereIdx = upperSql.lastIndexOf("WHERE");
        if (whereIdx >= 0) {
            // 已有 WHERE，追加 AND
            return sql + " AND" + condition;
        } else {
            // 无 WHERE（理论上 UPDATE/DELETE 应该有），追加 WHERE
            return sql + " WHERE" + condition;
        }
    }

    private Long getCurrentTenantId() {
        UserContext ctx = UserContext.get();
        if (ctx == null) {
            return null;
        }
        return ctx.getTenantId();
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
