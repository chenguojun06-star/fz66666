package com.fashion.supplychain.production.dto;

import lombok.Data;

/**
 * 扫码执行请求参数（支持外协模式）
 */
@Data
public class ScanExecuteRequest {

    /**
     * 订单号
     */
    private String orderNo;

    /**
     * 工序代码
     */
    private String processCode;

    /**
     * 工序名称
     */
    private String processName;

    /**
     * 扫码数量
     */
    private Integer quantity;

    /**
     * 是否外协模式
     * true: 外协工厂，允许手动填写操作人
     * false/null: 正常模式，自动记录登录用户
     */
    private Boolean isOutsourced;

    /**
     * 手动操作人姓名（仅外协模式使用）
     * 外协工厂的员工可能没有系统账号，需要手动填写
     */
    private String manualOperatorName;

    /**
     * 手动操作人ID（仅外协模式使用，可选）
     * 如果外协员工有系统ID，可以填写
     */
    private Long manualOperatorId;
}
