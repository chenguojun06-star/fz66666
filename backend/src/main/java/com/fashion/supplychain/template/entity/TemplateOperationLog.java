package com.fashion.supplychain.template.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_template_operation_log")
public class TemplateOperationLog {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String templateId;

    private String action;

    private String operator;

    private String remark;

    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
