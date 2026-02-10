package com.fashion.supplychain.common.datascope;

import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;

/**
 * 数据权限AOP切面
 * 在执行查询前，将数据过滤条件写入 DataScopeContextHolder，
 * 由 DataPermissionInterceptor（MyBatis拦截器）在SQL执行时自动拼接 WHERE 条件
 */
@Slf4j
@Aspect
@Component
public class DataScopeAspect {

    @Before("@annotation(dataScope)")
    public void doBefore(JoinPoint point, DataScope dataScope) {
        UserContext ctx = UserContext.get();
        if (ctx == null) {
            log.debug("DataScope: no user context, skip");
            return;
        }

        String scope = UserContext.getDataScope();
        if ("all".equals(scope)) {
            // 管理员看所有数据，不需要过滤
            log.debug("DataScope: user={} scope=all, no filter", ctx.getUsername());
            DataScopeContextHolder.clear();
            return;
        }

        DataScopeContext context = new DataScopeContext();
        context.setScope(scope);
        context.setUserId(ctx.getUserId());
        context.setTeamId(ctx.getTeamId());
        context.setCreatorColumn(dataScope.creatorColumn());
        context.setFactoryColumn(dataScope.factoryColumn());
        context.setTableAlias(dataScope.tableAlias());

        DataScopeContextHolder.set(context);
        log.debug("DataScope: user={} scope={} creatorCol={} factoryCol={}",
                ctx.getUsername(), scope, dataScope.creatorColumn(), dataScope.factoryColumn());
    }
}
