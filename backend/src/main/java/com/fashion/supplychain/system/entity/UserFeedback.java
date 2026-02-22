package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 用户问题反馈
 * 小程序和PC端双端均可提交，超管在客户管理页面统一查看处理
 */
@Data
@TableName("t_user_feedback")
public class UserFeedback {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private Long userId;

    private String userName;

    /** 租户名称（冗余存储，方便列表查询） */
    private String tenantName;

    /** 来源：PC / MINIPROGRAM */
    private String source;

    /** 分类：BUG / SUGGESTION / QUESTION / OTHER */
    private String category;

    private String title;

    private String content;

    /** 截图URL，JSON数组 */
    private String screenshotUrls;

    /** 联系方式（选填） */
    private String contact;

    /** 状态：PENDING / PROCESSING / RESOLVED / CLOSED */
    private String status;

    /** 管理员回复 */
    private String reply;

    private LocalDateTime replyTime;

    private Long replyUserId;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
