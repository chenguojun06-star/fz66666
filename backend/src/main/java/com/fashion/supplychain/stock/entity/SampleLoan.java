package com.fashion.supplychain.stock.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 样衣借还记录实体
 */
@Data
@TableName("t_sample_loan")
public class SampleLoan implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId
    private String id;

    /**
     * 样衣库存ID
     */
    private String sampleStockId;

    /**
     * 借用人
     */
    private String borrower;

    /**
     * 借用人ID
     */
    private String borrowerId;

    /**
     * 借出时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime loanDate;

    /**
     * 预计归还时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime expectedReturnDate;

    /**
     * 实际归还时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime returnDate;

    /**
     * 借用数量
     */
    private Integer quantity;

    /**
     * 状态: borrowed(借出中), returned(已归还), lost(丢失)
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
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    /**
     * 删除标记
     */
    private Integer deleteFlag;

    /**
     * 租户ID（多租户隔离）
     */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
