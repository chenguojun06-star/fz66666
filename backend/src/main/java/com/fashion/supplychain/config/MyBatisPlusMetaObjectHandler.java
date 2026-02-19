package com.fashion.supplychain.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * MyBatis Plus 元数据自动填充处理器
 * 自动填充创建人、更新人、时间等字段
 */
@Slf4j
@Component
public class MyBatisPlusMetaObjectHandler implements MetaObjectHandler {

    @Autowired(required = false)
    private AuthTokenService authTokenService;

    @Override
    public void insertFill(MetaObject metaObject) {
        LocalDateTime now = LocalDateTime.now();

        // 自动填充创建时间
        this.strictInsertFill(metaObject, "createTime", LocalDateTime.class, now);

        // 自动填充更新时间
        this.strictInsertFill(metaObject, "updateTime", LocalDateTime.class, now);

        // 获取当前登录用户信息
        String userId = null;
        String userName = "系统管理员";

        if (authTokenService != null) {
            try {
                userId = authTokenService.getCurrentUserId();
                userName = authTokenService.getCurrentUsername();
            } catch (Exception e) {
                log.debug("Failed to get current user info during insert", e);
            }
        }

        // 自动填充创建人
        this.strictInsertFill(metaObject, "creatorId", String.class, userId);
        this.strictInsertFill(metaObject, "creatorName", String.class, userName);

        // 自动填充更新人
        this.strictInsertFill(metaObject, "updaterId", String.class, userId);
        this.strictInsertFill(metaObject, "updaterName", String.class, userName);

        // 自动填充操作人（用于特定业务表）
        this.strictInsertFill(metaObject, "operatorId", String.class, userId);
        this.strictInsertFill(metaObject, "operatorName", String.class, userName);

        // 自动填充租户ID（多租户支持）
        Long tenantId = UserContext.tenantId();
        if (tenantId != null && metaObject.hasSetter("tenantId")) {
            Object existing = metaObject.getValue("tenantId");
            if (existing == null) {
                this.strictInsertFill(metaObject, "tenantId", Long.class, tenantId);
            }
        }

        log.debug("Auto fill on insert: userId={}, userName={}", userId, userName);
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        LocalDateTime now = LocalDateTime.now();

        // 自动填充更新时间
        this.strictUpdateFill(metaObject, "updateTime", LocalDateTime.class, now);

        // 获取当前登录用户信息
        String userId = null;
        String userName = "系统管理员";

        if (authTokenService != null) {
            try {
                userId = authTokenService.getCurrentUserId();
                userName = authTokenService.getCurrentUsername();
            } catch (Exception e) {
                log.debug("Failed to get current user info during update", e);
            }
        }

        // 自动填充更新人
        this.strictUpdateFill(metaObject, "updaterId", String.class, userId);
        this.strictUpdateFill(metaObject, "updaterName", String.class, userName);

        log.debug("Auto fill on update: userId={}, userName={}", userId, userName);
    }
}
