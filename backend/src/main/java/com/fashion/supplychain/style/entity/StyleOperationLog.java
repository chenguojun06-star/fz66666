package com.fashion.supplychain.style.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_style_operation_log")
public class StyleOperationLog {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long styleId;

    private String bizType;

    private String action;

    private String operator;

    private String remark;

    private LocalDateTime createTime;
}

