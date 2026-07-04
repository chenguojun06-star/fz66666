package com.fashion.supplychain.crm.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 审核退货单请求
 */
@Data
public class ApproveSalesReturnRequest {

    @NotNull(message = "退货单ID不能为空")
    private Long returnId;

    private String approveRemark;

    private BigDecimal refundAmount;
}