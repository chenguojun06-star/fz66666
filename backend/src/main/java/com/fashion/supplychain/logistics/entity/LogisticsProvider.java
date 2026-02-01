package com.fashion.supplychain.logistics.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 物流服务商配置表
 * 预留用于配置各快递公司API对接参数
 */
@Data
@TableName("t_logistics_provider")
public class LogisticsProvider {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    /**
     * 服务商编码
     */
    private String providerCode;

    /**
     * 服务商名称
     */
    private String providerName;

    /**
     * 快递公司代码
     */
    private String expressCompanyCode;

    /**
     * API接口地址
     */
    private String apiUrl;

    /**
     * API密钥
     */
    private String apiKey;

    /**
     * API密钥（备用）
     */
    private String apiSecret;

    /**
     * 商户ID
     */
    private String merchantId;

    /**
     * 电子面单账号
     */
    private String ebillAccount;

    /**
     * 电子面单密码
     */
    private String ebillPassword;

    /**
     * 月结账号
     */
    private String monthlyAccount;

    /**
     * 是否启用
     */
    private Boolean enabled;

    /**
     * 是否默认
     */
    private Boolean isDefault;

    /**
     * 请求超时时间(秒)
     */
    private Integer timeout;

    /**
     * 每日查询限额
     */
    private Integer dailyQueryLimit;

    /**
     * 已使用查询次数
     */
    private Integer usedQueryCount;

    /**
     * 备注
     */
    private String remark;

    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    /**
     * 删除标志
     */
    @TableLogic
    @TableField(fill = FieldFill.INSERT)
    private Integer deleteFlag;
}
