package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 站内通知实体（跟单员收件箱）
 */
@Data
@TableName("t_sys_notice")
public class SysNotice {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 收件人（对应 order.merchandiser，可能是 t_user.name 或 t_user.username） */
    private String toName;

    /** 发送人显示名 */
    private String fromName;

    /** 关联订单号 */
    private String orderNo;

    /** 通知标题 */
    private String title;

    /** 通知正文 */
    private String content;

    /** 通知类型：stagnant/deadline/quality/manual */
    private String noticeType;

    /** 是否已读：0未读 1已读 */
    private Integer isRead;

    /** 发送时间 */
    private LocalDateTime createdAt;
}
