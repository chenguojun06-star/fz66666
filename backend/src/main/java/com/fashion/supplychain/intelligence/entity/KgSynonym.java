package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_kg_synonym")
public class KgSynonym {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String word;

    private String canonicalEntity;

    private String entityType;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
