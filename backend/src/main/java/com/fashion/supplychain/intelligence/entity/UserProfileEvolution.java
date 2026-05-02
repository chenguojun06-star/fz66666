package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_user_profile_evolution")
public class UserProfileEvolution {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;
    private String userId;
    private String profileLayer;
    private String fieldKey;
    private String fieldValue;
    private BigDecimal confidence;
    private Integer evidenceCount;
    private String sourceConversationIds;
    private LocalDateTime lastObservedAt;

    @TableField("created_at")
    private LocalDateTime createTime;

    @TableField("updated_at")
    private LocalDateTime updateTime;
}
