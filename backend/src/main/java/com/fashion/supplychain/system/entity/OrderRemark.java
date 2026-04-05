package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 通用备注：按订单号(大货) 或 款号(样衣开发) 收集各节点人员的备注
 */
@Data
@TableName("t_order_remark")
public class OrderRemark {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** order=大货订单, style=样衣开发 */
    private String targetType;

    /** 订单号或款号 */
    private String targetNo;

    private String authorId;

    private String authorName;

    /** 填写人角色/工序节点 */
    private String authorRole;

    private String content;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private LocalDateTime createTime;

    private Integer deleteFlag;
}
