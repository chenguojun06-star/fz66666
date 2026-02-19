package com.fashion.supplychain.template.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.fasterxml.jackson.annotation.JsonRawValue;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_template_library")
public class TemplateLibrary {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String templateType;

    private String templateKey;

    private String templateName;

    private String sourceStyleNo;

    /**
     * 模板内容（JSON格式）
     * 使用@JsonRawValue确保输出原始JSON而不是转义的字符串
     */
    @JsonRawValue
    private String templateContent;

    private Integer locked;

    private String operatorName;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
