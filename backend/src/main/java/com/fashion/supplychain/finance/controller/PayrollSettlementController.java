package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.finance.orchestration.PayrollAggregationOrchestrator;
import com.fashion.supplychain.finance.orchestration.PayrollAggregationOrchestrator.PayrollOperatorProcessSummaryDTO;
import com.fashion.supplychain.common.Result;
import lombok.AllArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 工资结算 Controller
 * 支持按人员和工序分组查询工资聚合数据
 */
@RestController
@RequestMapping("/finance/payroll-settlement")
@AllArgsConstructor
public class PayrollSettlementController {

    private final PayrollAggregationOrchestrator payrollAggregationOrchestrator;

    /**
     * 获取人员工序汇总数据
     * 权限控制：需要 MENU_PAYROLL_OPERATOR_SUMMARY 权限
     * 数据权限：
     *   - 管理员(dataScope=all): 查看所有人员数据
     *   - 组长(dataScope=team): 查看团队数据
     *   - 普通员工(dataScope=own): 只能查看自己的数据
     *
     * @param params 查询参数：
     *        - orderNo: 订单号 (可选)
     *        - operatorName: 人员名称 (可选)
     *        - processName: 工序名 (可选)
     *        - startTime: 开始时间 (可选)
     *        - endTime: 结束时间 (可选)
     *        - includeSettled: 是否包含已结算 (默认 true)
     * @return 聚合结果列表
     */
    @PostMapping("/operator-summary")
    @PreAuthorize("hasAuthority('MENU_PAYROLL_OPERATOR_SUMMARY')")
    public Result<List<PayrollOperatorProcessSummaryDTO>> getOperatorSummary(
            @RequestBody Map<String, Object> params) {

        String orderNo = (String) params.get("orderNo");
        String operatorName = (String) params.get("operatorName");
        String processName = (String) params.get("processName");
        String startTimeStr = (String) params.get("startTime");
        String endTimeStr = (String) params.get("endTime");
        Boolean includeSettled = (Boolean) params.getOrDefault("includeSettled", true);

        // 解析时间
        LocalDateTime startTime = startTimeStr != null && !startTimeStr.isEmpty()
                ? LocalDateTime.parse(startTimeStr)
                : null;
        LocalDateTime endTime = endTimeStr != null && !endTimeStr.isEmpty()
                ? LocalDateTime.parse(endTimeStr)
                : null;

        List<PayrollOperatorProcessSummaryDTO> result = payrollAggregationOrchestrator
                .aggregatePayrollByOperatorAndProcess(
                        orderNo,
                        operatorName,
                        processName,
                        startTime,
                        endTime,
                        includeSettled != null && includeSettled
                );

        return Result.success(result);
    }
}
