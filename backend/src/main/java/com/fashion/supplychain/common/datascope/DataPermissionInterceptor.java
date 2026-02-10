package com.fashion.supplychain.common.datascope;

import lombok.extern.slf4j.Slf4j;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.StringValue;
import net.sf.jsqlparser.expression.operators.conditional.AndExpression;
import net.sf.jsqlparser.expression.operators.relational.EqualsTo;
import net.sf.jsqlparser.schema.Column;
import com.baomidou.mybatisplus.extension.plugins.inner.InnerInterceptor;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;

import java.sql.SQLException;

/**
 * MyBatis-Plus 数据权限拦截器
 * 自动在 SELECT 语句中追加数据过滤条件
 *
 * 工作流程:
 * 1. DataScopeAspect 解析 @DataScope 注解，写入 DataScopeContextHolder
 * 2. 本拦截器在 SQL 执行前读取上下文，修改 SQL 追加 WHERE 条件
 * 3. 执行后自动清理上下文
 *
 * 过滤规则:
 * - scope=own  → WHERE created_by_id = '当前用户ID'
 * - scope=team → WHERE created_by_id IN (SELECT user_id FROM team WHERE team_id = '当前团队ID')
 *                或简化为 factory_id = '当前团队工厂ID'
 * - scope=all  → 不过滤
 */
@Slf4j
public class DataPermissionInterceptor implements InnerInterceptor {

    @Override
    public void beforeQuery(Executor executor, MappedStatement ms, Object parameter,
                            RowBounds rowBounds, ResultHandler resultHandler, BoundSql boundSql) throws SQLException {
        DataScopeContext context = DataScopeContextHolder.get();
        if (context == null) {
            return;
        }

        try {
            String scope = context.getScope();
            if ("all".equals(scope) || scope == null) {
                return;
            }

            String originalSql = boundSql.getSql();
            String additionalCondition = buildCondition(context);

            if (additionalCondition != null && !additionalCondition.isEmpty()) {
                // 在原始 SQL 外包裹子查询，追加过滤条件
                String newSql = wrapSqlWithCondition(originalSql, additionalCondition);

                // 通过反射修改 BoundSql 的 sql 字段
                java.lang.reflect.Field sqlField = BoundSql.class.getDeclaredField("sql");
                sqlField.setAccessible(true);
                sqlField.set(boundSql, newSql);

                log.debug("DataPermission applied: scope={}, condition={}", scope, additionalCondition);
            }
        } catch (Exception e) {
            log.error("DataPermission interceptor error", e);
        } finally {
            // 使用后立即清理，防止污染后续查询
            DataScopeContextHolder.clear();
        }
    }

    /**
     * 根据数据范围构建过滤条件
     */
    private String buildCondition(DataScopeContext context) {
        StringBuilder condition = new StringBuilder();
        String prefix = context.getTableAlias() != null && !context.getTableAlias().isEmpty()
                ? context.getTableAlias() + "." : "";

        String scope = context.getScope();

        if ("own".equals(scope)) {
            // 仅查看自己的数据
            if (context.getCreatorColumn() != null && !context.getCreatorColumn().isEmpty()) {
                condition.append(prefix).append(context.getCreatorColumn())
                        .append(" = '").append(escapeSQL(context.getUserId())).append("'");
            }
        } else if ("team".equals(scope)) {
            // 查看团队数据（按工厂ID过滤）
            if (context.getFactoryColumn() != null && !context.getFactoryColumn().isEmpty()
                    && context.getTeamId() != null) {
                condition.append(prefix).append(context.getFactoryColumn())
                        .append(" = '").append(escapeSQL(context.getTeamId())).append("'");
            } else if (context.getCreatorColumn() != null && !context.getCreatorColumn().isEmpty()) {
                // 退化为按创建人过滤
                condition.append(prefix).append(context.getCreatorColumn())
                        .append(" = '").append(escapeSQL(context.getUserId())).append("'");
            }
        }

        return condition.toString();
    }

    /**
     * 在原始 SQL 中追加 WHERE 条件
     * 采用子查询包裹方式，兼容各种复杂 SQL
     */
    private String wrapSqlWithCondition(String originalSql, String condition) {
        // 简单方案：在 WHERE 1=1 AND ... 方式追加
        // 为避免破坏原始 SQL 结构，使用子查询包裹
        return "SELECT * FROM (" + originalSql + ") _data_scope WHERE " + condition;
    }

    /**
     * 防止 SQL 注入
     */
    private String escapeSQL(String value) {
        if (value == null) return "";
        return value.replace("'", "''").replace("\\", "\\\\");
    }
}
