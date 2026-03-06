package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_mind_push_log")
public class MindPushLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String ruleCode;
    private String orderId;
    private String orderNo;
    private String title;
    private String content;

    /** IN_APP / WECHAT */
    private String channel;

    private LocalDateTime pushedAt;
}
