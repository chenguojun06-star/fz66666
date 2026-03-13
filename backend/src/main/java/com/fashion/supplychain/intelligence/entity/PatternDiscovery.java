package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_pattern_discovery")
public class PatternDiscovery {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** seasonal|correlation|anomaly_cluster|efficiency_trend|bottleneck_recurrence */
    private String patternType;

    private String patternName;

    private String description;

    /** JSON证据 */
    private String evidence;

    private String dataSource;

    private LocalDateTime timeRangeStart;

    private LocalDateTime timeRangeEnd;

    private Integer confidence;

    private Integer impactScore;

    private Integer recurrenceCount;

    private LocalDateTime lastSeen;

    private String suggestedAction;

    private Integer isActionable;

    /** discovered|confirmed|applied|dismissed */
    private String status;

    private String appliedResult;

    private Integer deleteFlag;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
