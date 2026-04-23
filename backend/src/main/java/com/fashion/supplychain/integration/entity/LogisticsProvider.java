package com.fashion.supplychain.integration.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_logistics_provider")
public class LogisticsProvider {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String providerCode;
    private String providerName;
    private String expressCompanyCode;
    private String apiUrl;
    private String apiKey;
    private String apiSecret;
    private String merchantId;
    private String ebillAccount;
    private String ebillPassword;
    private String monthlyAccount;
    private Integer enabled;
    private Integer isDefault;
    private Integer timeout;
    private Integer dailyQueryLimit;
    private Integer usedQueryCount;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
