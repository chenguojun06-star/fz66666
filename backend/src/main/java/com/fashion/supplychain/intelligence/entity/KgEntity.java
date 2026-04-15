package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_kg_entity")
public class KgEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private String entityType;
    private String entityName;
    private String externalId;
    private String propertiesJson;
    private Integer deleteFlag;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
