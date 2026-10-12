package com.fashion.supplychain.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.fashion.supplychain.common.AuthTokenService;
import com.fashion.supplychain.common.UserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * MyBatis Plus 元数据自动填充处理器
 * 自动填充创建人、更新人、时间等字段
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MyBatisPlusMetaObjectHandler implements MetaObjectHandler {

    private final AuthTokenService authTokenService;

    @Override
    public void insertFill(MetaObject metaObject) {
        LocalDateTime now = LocalDateTime.now();

        this.strictInsertFill(metaObject, "createTime", LocalDateTime.class, now);
        this.strictInsertFill(metaObject, "updateTime", LocalDateTime.class, now);
        this.strictInsertFill(metaObject, "createdAt", LocalDateTime.class, now);
        this.strictInsertFill(metaObject, "updatedAt", LocalDateTime.class, now);

        // createdTime / updatedTime：另一套命名（integration/record 与 production 的部分实体用）
        //
        // ⚠️ 少了这两行会直接炸库：MyBatis-Plus 对声明了 fill 的字段**无条件**写进 INSERT 语句
        // （不受 NOT_NULL 策略保护），处理器没填就是 NULL；而 t_payment_record /
        // t_integration_callback_log / t_logistics_record 的 created_time 都是
        // NOT NULL DEFAULT CURRENT_TIMESTAMP —— 显式传 NULL 会覆盖默认值，
        // 报 "Column 'created_time' cannot be null"。
        // 2026-10-13 线上实证：支付回调日志写不进去 → 整条回调 500；
        // 同一缺陷让「在线支付落流水」也必失败（收银台扫码收款等于不可用）。
        this.strictInsertFill(metaObject, "createdTime", LocalDateTime.class, now);
        this.strictInsertFill(metaObject, "updatedTime", LocalDateTime.class, now);

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

        // 另一套命名：createBy / updateBy（warehouse、finance 的部分实体用）
        this.strictInsertFill(metaObject, "createBy", String.class, userName);
        this.strictInsertFill(metaObject, "updateBy", String.class, userName);

        // 自动填充更新人
        this.strictInsertFill(metaObject, "updaterId", String.class, userId);
        this.strictInsertFill(metaObject, "updaterName", String.class, userName);

        // 自动填充操作人（用于特定业务表）
        this.strictInsertFill(metaObject, "operatorId", String.class, userId);
        this.strictInsertFill(metaObject, "operatorName", String.class, userName);

        // 自动填充维护人（纸样修改等维护记录使用）
        this.strictInsertFill(metaObject, "maintainerId", String.class, userId);
        this.strictInsertFill(metaObject, "maintainerName", String.class, userName);
        this.strictInsertFill(metaObject, "maintainTime", LocalDateTime.class, now);

        // 逻辑删除位与「本人」字段：声明了 fill 就必须填，否则 INSERT 里是 NULL
        this.strictInsertFill(metaObject, "deleteFlag", Integer.class, 0);
        this.strictInsertFill(metaObject, "userId", String.class, userId);

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

        this.strictUpdateFill(metaObject, "updateTime", LocalDateTime.class, now);
        this.strictUpdateFill(metaObject, "updatedAt", LocalDateTime.class, now);
        // 同上：声明了 fill=INSERT_UPDATE 的字段在 UPDATE 时也要填，否则会被写成 NULL
        this.strictUpdateFill(metaObject, "updatedTime", LocalDateTime.class, now);

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
        this.strictUpdateFill(metaObject, "updateBy", String.class, userName);

        // 操作人（声明为 INSERT_UPDATE 的实体）
        this.strictUpdateFill(metaObject, "operatorId", String.class, userId);
        this.strictUpdateFill(metaObject, "operatorName", String.class, userName);

        log.debug("Auto fill on update: userId={}, userName={}", userId, userName);
    }
}
