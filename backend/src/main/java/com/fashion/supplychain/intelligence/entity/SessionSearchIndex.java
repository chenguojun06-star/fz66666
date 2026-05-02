package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_session_search_index")
public class SessionSearchIndex {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;
    private String userId;
    private String sessionId;
    private String conversationId;
    private String userMessage;
    private String assistantSummary;
    private String keyEntities;
    private String intentCategory;
    private Integer resolved;

    @TableField("created_at")
    private LocalDateTime createTime;
}
