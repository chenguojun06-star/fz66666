package com.fashion.supplychain.common.datascope;

import lombok.extern.slf4j.Slf4j;
import com.baomidou.mybatisplus.extension.plugins.inner.InnerInterceptor;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;

import java.sql.SQLException;
import java.util.Set;

@Slf4j
public class DataPermissionInterceptor implements InnerInterceptor {

    private static final Set<String> VALID_SCOPES = Set.of("all", "own", "team");
    private static final java.util.regex.Pattern IDENTIFIER_PATTERN =
            java.util.regex.Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    @Override
    @SuppressWarnings("rawtypes")
    public void beforeQuery(Executor executor, MappedStatement ms, Object parameter,
                            RowBounds rowBounds, ResultHandler resultHandler, BoundSql boundSql) throws SQLException {
        DataScopeContext context = DataScopeContextHolder.get();
        if (context == null) {
            return;
        }

        try {
            String scope = context.getScope();
            if (scope == null || "all".equals(scope)) {
                return;
            }

            if (!VALID_SCOPES.contains(scope)) {
                log.warn("[DataPermission] Unknown scope '{}', defaulting to 'own'", scope);
                scope = "own";
            }

            validateIdentifier(context.getCreatorColumn(), "creatorColumn");
            validateIdentifier(context.getFactoryColumn(), "factoryColumn");
            validateIdentifier(context.getTableAlias(), "tableAlias");

            String originalSql = boundSql.getSql();
            String additionalCondition = buildCondition(context, scope);

            if (additionalCondition != null && !additionalCondition.isEmpty()) {
                String newSql = wrapSqlWithCondition(originalSql, additionalCondition);

                java.lang.reflect.Field sqlField = BoundSql.class.getDeclaredField("sql");
                sqlField.setAccessible(true);
                sqlField.set(boundSql, newSql);

                log.debug("DataPermission applied: scope={}, condition={}", scope, additionalCondition);
            }
        } catch (Exception e) {
            log.error("[DataPermission] interceptor error, blocking query for safety", e);
            throw new SQLException("Data permission check failed, query blocked", e);
        } finally {
            DataScopeContextHolder.clear();
        }
    }

    private void validateIdentifier(String identifier, String fieldName) {
        if (identifier != null && !identifier.isEmpty()
                && !IDENTIFIER_PATTERN.matcher(identifier).matches()) {
            throw new IllegalArgumentException(
                    "Invalid " + fieldName + ": '" + identifier + "' contains illegal characters");
        }
    }

    private String buildCondition(DataScopeContext context, String scope) {
        StringBuilder condition = new StringBuilder();
        String prefix = context.getTableAlias() != null && !context.getTableAlias().isEmpty()
                ? context.getTableAlias() + "." : "";

        if ("own".equals(scope)) {
            if (context.getCreatorColumn() != null && !context.getCreatorColumn().isEmpty()) {
                condition.append(prefix).append(context.getCreatorColumn())
                        .append(" = '").append(escapeSQL(context.getUserId())).append("'");
            }
        } else if ("team".equals(scope)) {
            if (context.getFactoryColumn() != null && !context.getFactoryColumn().isEmpty()
                    && context.getTeamId() != null) {
                condition.append(prefix).append(context.getFactoryColumn())
                        .append(" = '").append(escapeSQL(context.getTeamId())).append("'");
            } else if (context.getCreatorColumn() != null && !context.getCreatorColumn().isEmpty()) {
                condition.append(prefix).append(context.getCreatorColumn())
                        .append(" = '").append(escapeSQL(context.getUserId())).append("'");
            }
        }

        return condition.toString();
    }

    private String wrapSqlWithCondition(String originalSql, String condition) {
        return "SELECT * FROM (" + originalSql + ") _data_scope WHERE " + condition;
    }

    private String escapeSQL(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\")
                    .replace("'", "''")
                    .replace("\"", "\"\"")
                    .replace("\0", "")
                    .replace("\n", "")
                    .replace("\r", "")
                    .replace("\u001a", "");
    }
}
