package com.fashion.supplychain.style.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 二次工艺实体类
 */
@Data
@TableName("t_secondary_process")
public class SecondaryProcess {

    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 款号ID
     */
    private Long styleId;

    /**
     * 工艺类型（embroidery/printing/washing/dyeing/ironing/pleating/beading/other）
     */
    private String processType;

    /**
     * 工艺名称
     */
    private String processName;

    /**
     * 数量
     */
    private Integer quantity;

    /**
     * 单价
     */
    private BigDecimal unitPrice;

    /**
     * 总价
     */
    private BigDecimal totalPrice;

    /**
     * 工厂名称（旧字段，兼容保留）
     */
    private String factoryName;

    /**
     * 工厂ID（关联t_factory表）
     */
    private String factoryId;

    /**
     * 工厂联系人
     */
    private String factoryContactPerson;

    /**
     * 工厂联系电话
     */
    private String factoryContactPhone;

    /**
     * 领取人
     */
    private String assignee;

    /**
     * 完成时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime completedTime;

    /**
     * 状态（pending/processing/completed/cancelled）
     */
    private String status;

    /**
     * 备注
     */
    private String remark;

    /**
     * 创建时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdAt;

    /**
     * 更新时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updatedAt;

    // ==================== 操作人字段（自动填充）====================

    @TableField(fill = FieldFill.INSERT)
    private String creatorId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorName;

    private String assigneeId;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String operatorId;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String operatorName;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
