package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.finance.orchestration.PayrollAggregationOrchestrator;
import com.fashion.supplychain.finance.orchestration.PayrollAggregationOrchestrator.PayrollOperatorProcessSummaryDTO;
import com.fashion.supplychain.finance.orchestration.PayrollSettlementOrchestrator;
import com.fashion.supplychain.common.Result;
import lombok.AllArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * 工资结算 Controller
 * 支持按人员和工序分组查询工资聚合数据，以及结算单取消/删除操作
 */
@RestController
@RequestMapping("/api/finance/payroll-settlement")
@AllArgsConstructor
@PreAuthorize("isAuthenticated()")
public class PayrollSettlementController {

    private final PayrollAggregationOrchestrator payrollAggregationOrchestrator;
    private final PayrollSettlementOrchestrator payrollSettlementOrchestrator;

    /**
     * 获取人员工序汇总数据
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
    public Result<List<PayrollOperatorProcessSummaryDTO>> getOperatorSummary(
            @RequestBody Map<String, Object> params) {

        String orderNo = (String) params.get("orderNo");
        String operatorName = (String) params.get("operatorName");
        String processName = (String) params.get("processName");
        String startTimeStr = (String) params.get("startTime");
        String endTimeStr = (String) params.get("endTime");
        Boolean includeSettled = (Boolean) params.getOrDefault("includeSettled", true);

        // 解析时间，支持两种格式："yyyy-MM-dd HH:mm:ss" 和 ISO格式
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        LocalDateTime startTime = null;
        LocalDateTime endTime = null;

        if (startTimeStr != null && !startTimeStr.trim().isEmpty()) {
            try {
                startTime = LocalDateTime.parse(startTimeStr.trim(), formatter);
            } catch (Exception e) {
                // 尝试ISO格式
                startTime = LocalDateTime.parse(startTimeStr.trim());
            }
        }

        if (endTimeStr != null && !endTimeStr.trim().isEmpty()) {
            try {
                endTime = LocalDateTime.parse(endTimeStr.trim(), formatter);
            } catch (Exception e) {
                // 尝试ISO格式
                endTime = LocalDateTime.parse(endTimeStr.trim());
            }
        }

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

    /**
     * 取消工资结算单
     * 只允许取消 pending 状态的结算单，取消后释放已关联的扫码记录
     *
     * @param id     结算单ID（路径参数）
     * @param params 请求体，包含 remark（取消原因）
     */
    @PostMapping("/{id}/cancel")
    public Result<Void> cancel(@PathVariable String id, @RequestBody(required = false) Map<String, Object> params) {
        String remark = params == null ? null : (String) params.get("remark");
        payrollSettlementOrchestrator.cancel(id, remark);
        return Result.success(null);
    }

    /**
     * 删除工资结算单
     * 只允许删除已取消(cancelled)的结算单，同时删除明细
     *
     * @param id 结算单ID（路径参数）
     */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        payrollSettlementOrchestrator.delete(id);
        return Result.success(null);
    }
}
