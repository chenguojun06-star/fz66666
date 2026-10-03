package com.fashion.supplychain.crm.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 租户级设置（键值，D-741）。
 *
 * <p>第一个使用者：{@code crm.receivable.paymentTermDays}（应收账期天数，出货后 N 天到期，默认 30）。
 */
@Data
@TableName("t_tenant_setting")
public class TenantSetting {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String settingKey;

    private String settingValue;

    private String remark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;
}
