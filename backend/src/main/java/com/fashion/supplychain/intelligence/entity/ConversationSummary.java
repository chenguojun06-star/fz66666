package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_conversation_summary")
public class ConversationSummary {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;
    private String userId;
    private String sessionId;
    private String summaryType;
    private String startConversationId;
    private String endConversationId;
    private String summaryTitle;
    private String summaryContent;
    private String keyInsights;
    private String actionItems;
    private Integer conversationCount;
    private String toolUsageStats;
    private LocalDateTime periodStart;
    private LocalDateTime periodEnd;

    @TableField("created_at")
    private LocalDateTime createTime;
}
