package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 角色模板实体类
 */
@Data
@TableName("t_role_template")
public class RoleTemplate {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 模板编码 */
    private String templateCode;

    /** 模板名称 */
    private String templateName;

    /** 模板描述 */
    private String templateDesc;

    /** 模板分类：CUSTOM-自定义，INDUSTRY-行业预设，SYSTEM-系统预设 */
    private String category;

    /** 是否为默认模板 */
    private Boolean isDefault;

    /** 权限码JSON数组 */
    private String permissionsJson;

    /** 数据权限范围 */
    private String permissionRange;

    /** 排序 */
    private Integer sortOrder;

    /** 是否启用 */
    private Boolean enabled;

    /** 删除标记 */
    private Integer deleteFlag;

    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /** 更新时间 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
