package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_cron_job")
public class CronJob {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;
    private String name;
    private String cronExpression;
    private String naturalLanguage;
    private String taskType;
    private String taskPrompt;
    private String skillTemplateId;
    private String notifyChannels;
    private String notifyUserId;
    private LocalDateTime lastRunAt;
    private String lastResult;
    private Integer successCount;
    private Integer failCount;
    private Integer enabled;
    private Integer deleteFlag;
    private String createdBy;

    @TableField("created_at")
    private LocalDateTime createTime;

    @TableField("updated_at")
    private LocalDateTime updateTime;
}
