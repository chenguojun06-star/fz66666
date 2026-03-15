package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_ai_user_profile")
public class AiUserProfile {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private String userId;
    private String behaviorSummary;
    private String preferencesJson;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
