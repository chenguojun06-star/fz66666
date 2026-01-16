package com.fashion.supplychain.template.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
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

    private String templateContent;

    private Integer locked;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
