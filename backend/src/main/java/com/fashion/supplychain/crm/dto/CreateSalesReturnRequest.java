package com.fashion.supplychain.crm.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * 创建退货单请求
 */
@Data
public class CreateSalesReturnRequest {

    @NotNull(message = "原订单ID不能为空")
    private Long originalOrderId;

    private String returnReason;

    private String remark;

    @NotNull(message = "退货商品列表不能为空")
    private List<SalesReturnItemRequest> items;
}