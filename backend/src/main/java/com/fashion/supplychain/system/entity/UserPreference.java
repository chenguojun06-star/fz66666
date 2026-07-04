package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 用户统一偏好实体（替代散落 localStorage）
 * 持久化用户级表格列显隐/列顺序/分页大小/筛选器等显示偏好
 */
@Data
@TableName("t_user_preference")
public class UserPreference {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    @TableField(fill = FieldFill.INSERT)
    private String userId;

    private String bizType;

    /** 页面标识，如 style-list / production-detail */
    private String pageKey;

    /** 偏好类型：visible_columns/column_order/page_size/sort_settings/filter_settings */
    private String preferenceType;

    /** 偏好值 JSON */
    private String preferenceValue;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
