package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_hyper_advisor_session")
public class HyperAdvisorSession {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private String userId;
    private String sessionId;
    private String role;
    private String content;
    private String metadataJson;
    private LocalDateTime createTime;
    private Integer deleteFlag;
}
