package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_push_timing")
public class PushTimingEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("tenant_id")
    private Long tenantId;

    @TableField("user_id")
    private String userId;

    @TableField("push_type")
    private String pushType;

    @TableField("preferred_hour")
    private Integer preferredHour;

    @TableField("preferred_minute")
    private Integer preferredMinute;

    @TableField("weekday_mask")
    private Integer weekdayMask;

    @TableField("quiet_hours_start")
    private Integer quietHoursStart;

    @TableField("quiet_hours_end")
    private Integer quietHoursEnd;

    @TableField("last_push_at")
    private LocalDateTime lastPushAt;

    @TableField("push_count")
    private Integer pushCount;

    @TableField("open_count")
    private Integer openCount;

    @TableField("open_rate")
    private Double openRate;

    @TableField("enabled")
    private Integer enabled;

    @TableLogic
    @TableField("delete_flag")
    private Integer deleteFlag;

    @TableField("create_time")
    private LocalDateTime createTime;

    @TableField("update_time")
    private LocalDateTime updateTime;
}
