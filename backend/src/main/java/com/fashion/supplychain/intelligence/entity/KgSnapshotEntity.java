package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_kg_snapshot")
public class KgSnapshotEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("tenant_id")
    private Long tenantId;

    @TableField("snapshot_version")
    private String snapshotVersion;

    @TableField("relation_type")
    private String relationType;

    @TableField("relation_count")
    private Integer relationCount;

    @TableField("payload")
    private String payload;

    @TableField("payload_size")
    private Integer payloadSize;

    @TableField("build_source")
    private String buildSource;

    @TableField("build_duration_ms")
    private Integer buildDurationMs;

    @TableLogic
    @TableField("delete_flag")
    private Integer deleteFlag;

    @TableField("create_time")
    private LocalDateTime createTime;
}
