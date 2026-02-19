package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 角色实体类
 */
@Data
@TableName("t_role")
public class Role {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String roleName;

    private String roleCode;

    private String description;

    private String status;

    private String dataScope; // 数据权限范围: all-全部数据, self-仅本人数据

    /** 所属租户(NULL=全局模板) */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 是否为角色模板(1=模板,0=租户角色) */
    private Boolean isTemplate;

    /** 克隆来源模板ID */
    private Long sourceTemplateId;

    /** 排序权重 */
    private Integer sortOrder;

    @TableField(exist = false)
    private String operationRemark;

    /** 权限数量（非持久化字段，用于列表展示） */
    @TableField(exist = false)
    private Integer permissionCount;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
