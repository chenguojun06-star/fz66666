package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 扫码停滞预警响应 DTO（B3）
 */
@Data
public class StagnantAlertResponse {

    /** 检查订单总数 */
    private int checkedOrders;
    /** 停滞订单数 */
    private int stagnantCount;
    /** 停滞预警列表 */
    private List<StagnantOrderAlert> alerts = new ArrayList<>();

    @Data
    public static class StagnantOrderAlert {
        private String orderId;
        private String orderNo;
        private String styleNo;
        private String factoryName;
        /** 最后扫码时间（yyyy-MM-dd HH:mm） */
        private String lastScanTime;
        /** 停滞天数 */
        private int stagnantDays;
        /** 当前进度% */
        private int currentProgress;
        /** 计划交期 */
        private String plannedEndDate;
        /** 距交期天数（负数=已逾期） */
        private int daysToDeadline;
        /** 严重程度：watch / alert / urgent */
        private String severity;
        /** 行动建议 */
        private String actionAdvice;
    }
}
