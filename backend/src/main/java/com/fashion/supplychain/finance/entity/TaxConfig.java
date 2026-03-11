package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 税率配置实体
 */
@Data
@TableName("t_tax_config")
public class TaxConfig {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 税种名称（增值税 / 企业所得税 / 附加税等） */
    private String taxName;

    /** 税种代码（VAT / CIT / SURCHARGE 等） */
    private String taxCode;

    /** 税率（如 0.1300 = 13%） */
    private BigDecimal taxRate;

    /** 是否默认税率 */
    private Integer isDefault;

    /** 生效日期 */
    private LocalDate effectiveDate;

    /** 到期日（NULL = 永久有效） */
    private LocalDate expiryDate;

    private String description;

    /** ACTIVE / INACTIVE */
    private String status;

    private Long tenantId;
    private String creatorId;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
