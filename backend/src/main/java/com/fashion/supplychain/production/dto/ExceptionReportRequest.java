package com.fashion.supplychain.production.dto;

import lombok.Data;
import javax.validation.constraints.NotBlank;

@Data
public class ExceptionReportRequest {
    @NotBlank(message = "订单号不能为空")
    private String orderNo;

    @NotBlank(message = "工序不能为空")
    private String processName;

    @NotBlank(message = "异常类型不能为空")
    private String exceptionType;

    private String description;

    private Long tenantId;
}
