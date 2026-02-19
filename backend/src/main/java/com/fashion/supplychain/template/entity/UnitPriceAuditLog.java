package com.fashion.supplychain.template.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 单价修改审计日志
 */
@Data
@TableName("t_unit_price_audit_log")
public class UnitPriceAuditLog {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 款号
     */
    private String styleNo;

    /**
     * 工序名称
     */
    private String processName;

    /**
     * 修改前单价
     */
    private BigDecimal oldPrice;

    /**
     * 修改后单价
     */
    private BigDecimal newPrice;

    /**
     * 变更来源: template(模板), scan(扫码), reconciliation(对账)
     */
    private String changeSource;

    /**
     * 关联ID (模板ID/订单ID等)
     */
    private String relatedId;

    /**
     * 操作人
     */
    private String operator;

    /**
     * 操作时间
     */
    private LocalDateTime createTime;

    /**
     * 备注
     */
    private String remark;

    /**
     * 租户ID（自动填充）
     */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
