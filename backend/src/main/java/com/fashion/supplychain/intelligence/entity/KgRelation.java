package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_kg_relation")
public class KgRelation {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private Long sourceId;
    private Long targetId;
    private String relationType;
    private Double weight;
    private String propertiesJson;
    private Integer deleteFlag;
    private LocalDateTime createdAt;
}
