package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_memory_nudge")
public class MemoryNudge {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;
    private String userId;
    private String nudgeType;
    private String title;
    private String content;
    private String contextSummary;
    private String status;
    private LocalDateTime acceptedAt;
    private LocalDateTime dismissedAt;
    private LocalDateTime expiresAt;
    private String conversationId;
    private BigDecimal confidence;

    @TableField("created_at")
    private LocalDateTime createTime;

    @TableField("updated_at")
    private LocalDateTime updateTime;
}
