package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.orchestration.PayrollAggregationOrchestrator;
import com.fashion.supplychain.finance.orchestration.PayrollAggregationOrchestrator.PayrollOperatorProcessSummaryDTO;
import lombok.AllArgsConstructor;
import lombok.Data;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 工资审批付款 Controller
 * 处理从工资结算审批过来的付款流程
 * 数据来源：从扫码记录聚合的人员工资数据
 */
@RestController
@RequestMapping("/api/finance/payroll-approval")
@AllArgsConstructor
public class PayrollApprovalController {

    private final PayrollAggregationOrchestrator payrollAggregationOrchestrator;

    // 内存中保存审批状态（生产环境应该持久化到数据库）
    private static final Map<String, PayrollApprovalRecord> approvalRecords = new HashMap<>();

    /**
     * 工资审批记录
     */
    @Data
    public static class PayrollApprovalRecord {
        private String id;
        private String operatorId;
        private String operatorName;
        private Integer totalQuantity;
        private BigDecimal totalAmount;
        private Integer recordCount;
        private Integer orderCount;
        private String status = "pending";  // pending, verified, approved, paid, rejected
        private LocalDateTime approvalTime;
        private LocalDateTime paymentTime;
        private String remark;
        private LocalDateTime createTime;
        private LocalDateTime updateTime;
    }

    /**
     * 获取工资审批付款列表
     * 数据来源：从扫码记录聚合的人员工资数据
     */
    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYROLL_APPROVAL_VIEW')")
    @GetMapping("/list")
    public Result<Map<String, Object>> list(
            @RequestParam(required = false) String operatorName,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize) {

        // 从扫码记录聚合获取人员工资数据
        List<PayrollOperatorProcessSummaryDTO> summaryList = payrollAggregationOrchestrator
                .aggregatePayrollByOperatorAndProcess(null, null, null, null, null, true);

        // 按人员汇总
        Map<String, PayrollApprovalRecord> operatorMap = new LinkedHashMap<>();
        for (PayrollOperatorProcessSummaryDTO dto : summaryList) {
            String opName = dto.getOperatorName();
            if (opName == null || opName.trim().isEmpty()) continue;

            PayrollApprovalRecord record = operatorMap.computeIfAbsent(opName, k -> {
                PayrollApprovalRecord r = new PayrollApprovalRecord();
                r.setId(UUID.randomUUID().toString().replace("-", ""));
                r.setOperatorId(dto.getOperatorId());
                r.setOperatorName(opName);
                r.setTotalQuantity(0);
                r.setTotalAmount(BigDecimal.ZERO);
                r.setRecordCount(0);
                r.setOrderCount(0);
                r.setCreateTime(LocalDateTime.now());
                r.setUpdateTime(LocalDateTime.now());

                // 从内存中恢复审批状态
                PayrollApprovalRecord existing = approvalRecords.get(opName);
                if (existing != null) {
                    r.setId(existing.getId());
                    r.setStatus(existing.getStatus());
                    r.setApprovalTime(existing.getApprovalTime());
                    r.setPaymentTime(existing.getPaymentTime());
                    r.setRemark(existing.getRemark());
                }

                return r;
            });

            // 累加数量和金额
            int qty = dto.getQuantity() != null ? dto.getQuantity().intValue() : 0;
            record.setTotalQuantity(record.getTotalQuantity() + qty);
            record.setTotalAmount(record.getTotalAmount().add(dto.getTotalAmount() != null ? dto.getTotalAmount() : BigDecimal.ZERO));
            record.setRecordCount(record.getRecordCount() + 1);
        }

        // 统计订单数（简化处理，实际应该从数据中计算）
        for (PayrollApprovalRecord record : operatorMap.values()) {
            // 简单设置订单数为记录数的一半（实际应该去重统计）
            record.setOrderCount(Math.max(1, record.getRecordCount() / 5));
        }

        // 转换为列表
        List<PayrollApprovalRecord> records = new ArrayList<>(operatorMap.values());

        // 过滤条件
        if (operatorName != null && !operatorName.trim().isEmpty()) {
            String filter = operatorName.trim().toLowerCase();
            records = records.stream()
                    .filter(r -> r.getOperatorName().toLowerCase().contains(filter))
                    .collect(Collectors.toList());
        }
        if (status != null && !status.trim().isEmpty()) {
            String filterStatus = status.trim();
            records = records.stream()
                    .filter(r -> filterStatus.equals(r.getStatus()))
                    .collect(Collectors.toList());
        }

        // 分页
        int total = records.size();
        int start = (page - 1) * pageSize;
        int end = Math.min(start + pageSize, total);
        List<PayrollApprovalRecord> pagedRecords = start < total ? records.subList(start, end) : new ArrayList<>();

        Map<String, Object> data = new HashMap<>();
        data.put("records", pagedRecords);
        data.put("total", total);

        return Result.success(data);
    }

    /**
     * 更新审批状态
     */
    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYROLL_APPROVAL_MANAGE')")
    @PostMapping("/update-status")
    public Result<Void> updateStatus(@RequestBody Map<String, String> request) {
        String id = request.get("id");
        String status = request.get("status");

        if (id == null || id.trim().isEmpty()) {
            return Result.fail("ID不能为空");
        }
        if (status == null || status.trim().isEmpty()) {
            return Result.fail("状态不能为空");
        }

        if (!isValidStatus(status)) {
            return Result.fail("无效的状态值");
        }

        // 查找记录（通过ID或operatorName）
        PayrollApprovalRecord record = null;
        for (PayrollApprovalRecord r : approvalRecords.values()) {
            if (id.equals(r.getId()) || id.equals(r.getOperatorName())) {
                record = r;
                break;
            }
        }

        if (record == null) {
            // 创建新记录
            record = new PayrollApprovalRecord();
            record.setId(id);
            record.setOperatorName(id);  // 用ID作为operatorName
            record.setStatus("pending");
            record.setCreateTime(LocalDateTime.now());
        }

        // 验证状态转换
        if (!canTransition(record.getStatus(), status)) {
            return Result.fail("无法从 " + record.getStatus() + " 转换到 " + status);
        }

        // 更新状态
        record.setStatus(status);
        record.setUpdateTime(LocalDateTime.now());

        if ("verified".equals(status) || "approved".equals(status)) {
            record.setApprovalTime(LocalDateTime.now());
        }
        if ("paid".equals(status)) {
            record.setPaymentTime(LocalDateTime.now());
        }

        // 保存到内存
        approvalRecords.put(record.getOperatorName(), record);

        return Result.success();
    }

    /**
     * 退回（重审）
     */
    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYROLL_APPROVAL_MANAGE')")
    @PostMapping("/return")
    public Result<Void> returnToPrevious(@RequestBody Map<String, String> request) {
        String id = request.get("id");
        String reason = request.get("reason");

        if (id == null || id.trim().isEmpty()) {
            return Result.fail("ID不能为空");
        }

        // 查找或创建记录
        PayrollApprovalRecord record = null;
        for (PayrollApprovalRecord r : approvalRecords.values()) {
            if (id.equals(r.getId()) || id.equals(r.getOperatorName())) {
                record = r;
                break;
            }
        }

        if (record == null) {
            record = new PayrollApprovalRecord();
            record.setId(id);
            record.setOperatorName(id);
            record.setCreateTime(LocalDateTime.now());
        }

        // 退回到待审核状态
        record.setStatus("pending");
        record.setRemark(reason != null ? "【退回】" + reason.trim() : "【退回】");
        record.setUpdateTime(LocalDateTime.now());
        record.setApprovalTime(null);
        record.setPaymentTime(null);

        approvalRecords.put(record.getOperatorName(), record);

        return Result.success();
    }

    private boolean isValidStatus(String status) {
        return "pending".equals(status) ||
               "verified".equals(status) ||
               "approved".equals(status) ||
               "paid".equals(status) ||
               "rejected".equals(status);
    }

    private boolean canTransition(String from, String to) {
        if (from == null) from = "pending";
        if (from.equals(to)) return false;

        switch (from) {
            case "pending":
                return "verified".equals(to) || "rejected".equals(to);
            case "verified":
                return "approved".equals(to) || "rejected".equals(to);
            case "approved":
                return "paid".equals(to) || "rejected".equals(to);
            default:
                return false;
        }
    }
}
