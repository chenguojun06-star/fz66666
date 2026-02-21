package com.fashion.supplychain.common.tenant;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.apache.ibatis.reflection.MetaObject;

/**
 * 多租户自动填充处理器
 * 在 INSERT 操作时自动设置 tenant_id 字段
 *
 * 工作原理：
 * 1. MyBatis-Plus 在执行 INSERT 前会调用 insertFill
 * 2. 从 UserContext 获取当前租户ID
 * 3. 自动填充到实体的 tenantId 字段
 *
 * 注意：实体类需要用 @TableField(fill = FieldFill.INSERT) 标注 tenantId 字段
 * 或者通过通用 BaseEntity 继承方式统一处理
 */
@Slf4j
// @Component  -- 已合并到 MyBatisPlusMetaObjectHandler，避免 MetaObjectHandler bean 冲突
public class TenantMetaObjectHandler implements MetaObjectHandler {

    @Override
    public void insertFill(MetaObject metaObject) {
        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            // 自动填充 tenantId（如果实体有此字段且未设值）
            if (metaObject.hasSetter("tenantId")) {
                Object existing = metaObject.getValue("tenantId");
                if (existing == null) {
                    this.strictInsertFill(metaObject, "tenantId", Long.class, tenantId);
                    log.debug("Auto-filled tenantId={} for INSERT", tenantId);
                }
            }
        }
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        // UPDATE 不需要修改 tenant_id
    }
}
