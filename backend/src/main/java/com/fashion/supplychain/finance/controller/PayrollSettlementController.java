package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.finance.orchestration.PayrollAggregationOrchestrator;
import com.fashion.supplychain.finance.orchestration.PayrollAggregationOrchestrator.PayrollOperatorProcessSummaryDTO;
import com.fashion.supplychain.finance.orchestration.PayrollSettlementOrchestrator;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import lombok.AllArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 工资结算 Controller
 * 支持按人员和工序分组查询工资聚合数据，以及结算单取消/删除操作
 *
 * <p>D-637：原先本类直接注入了 FinishedSettlementApprovalStatusService 与
 * WagePaymentService（审批状态富化、打款状态富化、明细审批落库都在 Controller 里做），
 * 属「Controller 依赖多个 Service」。富化逻辑已下沉到
 * {@link PayrollAggregationOrchestrator} 与 {@link PayrollSettlementOrchestrator}，
 * 本类只保留「端点声明 + 参数解析/校验 + 响应组装」。
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
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/operator-summary")
    public Result<List<PayrollOperatorProcessSummaryDTO>> getOperatorSummary(
            @RequestBody Map<String, Object> params) {
        // 工厂账号不可查看工资结算汇总（属于租户级财务管理数据）
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return Result.success(java.util.Collections.emptyList());
        }

        String orderNo = trimmed(params, "orderNo");
        String operatorName = trimmed(params, "operatorName");
        String processName = trimmed(params, "processName");
        String scanType = trimmed(params, "scanType");

        // 解析时间，支持两种格式："yyyy-MM-dd HH:mm:ss" 和 ISO格式
        LocalDateTime startTime = parseDateTime(trimmed(params, "startTime"));
        LocalDateTime endTime = parseDateTime(trimmed(params, "endTime"));

        Boolean includeSettled = toBoolean(params.getOrDefault("includeSettled", true));

        List<PayrollOperatorProcessSummaryDTO> result = payrollAggregationOrchestrator
                .summarizeForOperatorProcess(
                        orderNo,
                        operatorName,
                        processName,
                        scanType,
                        startTime,
                        endTime,
                        includeSettled != null && includeSettled
                );

        return Result.success(result);
    }

    /** 取参并 trim；null 安全 */
    private static String trimmed(Map<String, Object> params, String key) {
        Object v = params == null ? null : params.get(key);
        return v != null ? String.valueOf(v).trim() : null;
    }

    /** 宽松布尔解析：兼容 Boolean 与字符串；无法判断时返回 null */
    private static Boolean toBoolean(Object raw) {
        if (raw instanceof Boolean) {
            return (Boolean) raw;
        }
        if (raw != null) {
            return Boolean.parseBoolean(String.valueOf(raw).trim());
        }
        return null;
    }

    /** 时间解析：先按 "yyyy-MM-dd HH:mm:ss"，失败再按 ISO；空值返回 null */
    private static LocalDateTime parseDateTime(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return null;
        }
        try {
            return LocalDateTime.parse(raw.trim(), DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        } catch (Exception e) {
            // 尝试ISO格式
            return LocalDateTime.parse(raw.trim());
        }
    }

    /**
     * 审核单条工资工序明细（持久化）
     */
    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @PostMapping("/detail-approval/{approvalId}/approve")
    public Result<Void> approveDetail(@PathVariable String approvalId) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可审核工资明细");
        }
        String normalized = approvalId == null ? null : approvalId.trim();
        if (normalized == null || normalized.isEmpty()) {
            return Result.fail("审批ID不能为空");
        }

        payrollSettlementOrchestrator.approveDetail(normalized);
        return Result.success(null);
    }

    /**
     * 审核通过工资结算单
     * 仅允许审核 pending 状态的结算单
     * 审核通过后将状态改为 approved，并绑定确认人信息
     *
     * @param id     结算单ID（路径参数）
     * @param params 请求体，包含 remark（审核备注）
     */
    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @PostMapping("/{id}/approve")
    public Result<Void> approve(@PathVariable String id, @RequestBody(required = false) Map<String, Object> params) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可审核工资结算单");
        }
        Object remarkObj = params == null ? null : params.get("remark");
        String remark = remarkObj != null ? String.valueOf(remarkObj).trim() : null;
        payrollSettlementOrchestrator.approve(id, remark);
        return Result.success(null);
    }

    /**
     * D-131 工资页「终审推送」统一入口：按人生成结算单→审核→确认账单派生应付款。
     * 替代旧前端直推 create-payable(bizId=operatorId) 的旁路（bizId 错位导致付款后状态永不回写、
     * 扫码未绑定结算单导致关单重复计酬）。
     *
     * @param body operatorId / operatorName 二选一
     */
    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @PostMapping("/finalize-for-operator")
    public Result<PayrollSettlement> finalizeForOperator(@RequestBody Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可终审工资");
        }
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return Result.fail("工厂账号无权终审工资");
        }
        String operatorId = body.get("operatorId") != null ? String.valueOf(body.get("operatorId")).trim() : null;
        String operatorName = body.get("operatorName") != null ? String.valueOf(body.get("operatorName")).trim() : null;
        PayrollSettlement settlement = payrollSettlementOrchestrator.finalizeForOperator(operatorId, operatorName);
        return Result.success(settlement);
    }

    /**
     * 取消工资结算单
     * 只允许取消 pending 状态的结算单，取消后释放已关联的扫码记录
     *
     * @param id     结算单ID（路径参数）
     * @param params 请求体，包含 remark（取消原因）
     */
    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @PostMapping("/{id}/cancel")
    public Result<Void> cancel(@PathVariable String id, @RequestBody(required = false) Map<String, Object> params) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可取消工资结算单");
        }
        Object remarkObj = params == null ? null : params.get("remark");
        String remark = remarkObj != null ? String.valueOf(remarkObj).trim() : null;
        payrollSettlementOrchestrator.cancel(id, remark);
        return Result.success(null);
    }

    /**
     * 反向审核工资结算单
     * 仅允许 approved 状态的结算单反向审核，将状态改回 pending
     *
     * @param id     结算单ID（路径参数）
     * @param params 请求体，包含 reason（反向审核原因）
     */
    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @PostMapping("/{id}/reverse-approve")
    public Result<Void> reverseApprove(@PathVariable String id, @RequestBody(required = false) Map<String, Object> params) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可反向审核工资结算单");
        }
        Object reasonObj = params == null ? null : params.get("reason");
        String reason = reasonObj != null ? String.valueOf(reasonObj).trim() : null;
        payrollSettlementOrchestrator.reverseApprove(id, reason);
        return Result.success(null);
    }

    /**
     * 删除工资结算单
     * 只允许删除已取消(cancelled)的结算单，同时删除明细
     *
     * @param id 结算单ID（路径参数）
     */
    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可删除工资结算单");
        }
        payrollSettlementOrchestrator.delete(id);
        return Result.success(null);
    }

    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @PutMapping("/{id}/payment")
    public Result<Void> recordPayment(@PathVariable String id, @RequestBody Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可记录打款");
        }
        BigDecimal amount = null;
        if (body != null) {
            Object amountObj = body.get("amount");
            if (amountObj != null) {
                try {
                    amount = new BigDecimal(amountObj.toString().trim());
                } catch (NumberFormatException e) {
                    return Result.fail("金额格式不正确");
                }
            }
        }
        payrollSettlementOrchestrator.recordPayment(id, amount);
        return Result.success(null);
    }

    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @PostMapping("/{id}/deduction")
    public Result<Void> applyDeduction(@PathVariable String id, @RequestBody Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可添加扣款");
        }
        BigDecimal amount = null;
        String type = null;
        String desc = null;
        if (body != null) {
            Object raw = body.getOrDefault("deductionAmount", body.get("amount"));
            if (raw != null) {
                try {
                    amount = new BigDecimal(raw.toString().trim());
                } catch (NumberFormatException e) {
                    return Result.fail("金额格式不正确");
                }
            }
            Object typeObj = body.getOrDefault("deductionType", body.get("type"));
            type = typeObj != null ? String.valueOf(typeObj).trim() : null;
            Object descObj = body.get("description");
            desc = descObj != null ? String.valueOf(descObj).trim() : null;
        }
        payrollSettlementOrchestrator.applyDeduction(id, amount, type, desc);
        return Result.success(null);
    }
}
