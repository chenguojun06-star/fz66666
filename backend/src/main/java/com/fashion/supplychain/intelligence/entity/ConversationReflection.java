package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_conversation_reflection")
public class ConversationReflection {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;
    private String conversationId;
    private String sessionId;
    private String userMessage;
    private String reflectionType;
    private String reflectionContent;
    private String extractedSkillId;
    private String actionItems;
    private BigDecimal qualityScore;
    private String promptSuggestion;
    private Integer resolved;

    @TableField("created_at")
    private LocalDateTime createTime;
}
