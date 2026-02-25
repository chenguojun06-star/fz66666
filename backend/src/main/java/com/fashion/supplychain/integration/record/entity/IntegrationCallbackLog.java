package com.fashion.supplychain.integration.record.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 第三方回调日志实体
 * 所有来自支付宝/微信/顺丰/申通的 Webhook 原始报文都存这里
 * 用途：
 *   1. 重复回调去重
 *   2. 排查问题（原始报文永久存档）
 *   3. 人工重新处理（processed=0 的记录可补跑）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("t_integration_callback_log")
public class IntegrationCallbackLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 回调类型：PAYMENT / LOGISTICS */
    private String type;

    /** 渠道：ALIPAY / WECHAT_PAY / SF / STO */
    private String channel;

    /** 原始回调报文（原封不动存储） */
    private String rawBody;

    /** 关键请求头（JSON格式，含签名、时间戳等） */
    private String headers;

    /** 签名验证是否通过 */
    @Builder.Default
    private Boolean verified = false;

    /** 业务处理是否完成（成功更新订单状态等） */
    @Builder.Default
    private Boolean processed = false;

    /** 解析出的关联业务订单号 */
    private String relatedOrderId;

    /** 处理失败原因 */
    private String errorMessage;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdTime;
}
