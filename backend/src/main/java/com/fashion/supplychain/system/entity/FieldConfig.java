package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 字段配置元数据实体（多租户字段定制）
 * 每租户每业务对象每字段一行配置，定义字段显隐/顺序/标签/类型/权限
 */
@Data
@TableName("t_field_config")
public class FieldConfig {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 业务对象类型：style/order/production/scan/customer/supplier */
    private String bizType;

    /** 字段唯一键，如 sample_dev_cost */
    private String fieldKey;

    /** 字段显示名 */
    private String label;

    /** 字段类型：text/number/date/select/multiselect/textarea/switch */
    private String fieldType;

    /** select/multiselect 选项 JSON 数组 */
    private String optionsJson;

    /** 校验规则 JSON：required/pattern/min/max */
    private String validationsJson;

    private String pcWidget;
    private String h5Widget;
    private String mpWidget;

    private Integer pcColSpan;
    private Integer h5ColSpan;

    private Integer sortOrder;

    /** 1=系统字段（不可删，可改显隐/标签）0=租户自定义字段 */
    private Integer isSystem;

    /** 是否启用 */
    private Integer enabled;

    /** 可见角色 ID 数组 JSON（null=全部可见） */
    private String visibleRoles;

    /** 可编辑角色 ID 数组 JSON（null=全部可编辑） */
    private String editableRoles;

    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;
}
