package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_nl_query_log")
public class NlQueryLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String userId;

    private String question;

    private String detectedIntent;

    private Integer confidence;

    private String handlerType;

    private String userFeedback;

    private String correctIntent;

    private Integer responseTimeMs;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
