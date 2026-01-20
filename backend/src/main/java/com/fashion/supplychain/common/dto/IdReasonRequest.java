package com.fashion.supplychain.common.dto;

import javax.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 通用请求对象：用于“退回/驳回”等需要 id + 原因 的接口。
 */
@Data
public class IdReasonRequest {

    /**
     * 业务ID。
     */
    @NotBlank(message = "id不能为空")
    private String id;

    /**
     * 操作原因。
     */
    @NotBlank(message = "reason不能为空")
    private String reason;
}

