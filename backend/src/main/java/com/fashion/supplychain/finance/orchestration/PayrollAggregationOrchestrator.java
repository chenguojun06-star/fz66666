package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.AllArgsConstructor;
import lombok.Data;
import org.springframework.stereotype.Component;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 工资聚合编排器
 * 基于 ScanRecord 按 operator_id + process_name 分组，
 * 生成人员工序结算数据
 */
@Component
public class PayrollAggregationOrchestrator {

    private final ScanRecordService scanRecordService;

    public PayrollAggregationOrchestrator(ScanRecordService scanRecordService) {
        this.scanRecordService = scanRecordService;
    }

    /**
     * 查询人员工序汇总数据
     *
     * @param orderNo 订单号（可选）
     * @param operatorName 人员名称（可选）
     * @param processName 工序名（可选）
     * @param startTime 开始时间（可选）
     * @param endTime 结束时间（可选）
     * @param includeSettled 是否包含已结算
     * @return 聚合结果列表
     */
    public List<PayrollOperatorProcessSummaryDTO> aggregatePayrollByOperatorAndProcess(
            String orderNo,
            String operatorName,
            String processName,
            LocalDateTime startTime,
            LocalDateTime endTime,
            boolean includeSettled) {

        // 构建查询条件
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();

        if (orderNo != null && !orderNo.trim().isEmpty()) {
            qw.eq("order_no", orderNo.trim());
        }

        if (operatorName != null && !operatorName.trim().isEmpty()) {
            qw.like("operator_name", operatorName.trim());
        }

        if (processName != null && !processName.trim().isEmpty()) {
            qw.eq("process_name", processName.trim());
        }

        if (startTime != null) {
            qw.ge("scan_time", startTime);
        }

        if (endTime != null) {
            qw.le("scan_time", endTime);
        }

        // 查询扫码记录
        List<ScanRecord> scanRecords = scanRecordService.list(qw);

        // 按 operator_id + process_name 分组
        Map<String, List<ScanRecord>> grouped = scanRecords.stream()
                .collect(Collectors.groupingBy(
                        record -> record.getOperatorId() + "|" + record.getProcessName(),
                        Collectors.toList()
                ));

        // 转换为 DTO
        return grouped.values().stream()
                .map(this::convertToDTO)
                .sorted(Comparator
                        .comparing((PayrollOperatorProcessSummaryDTO d) -> d.getOperatorName())
                        .thenComparing(PayrollOperatorProcessSummaryDTO::getProcessName))
                .collect(Collectors.toList());
    }

    /**
     * 将 ScanRecord 列表转换为 PayrollOperatorProcessSummaryDTO
     */
    private PayrollOperatorProcessSummaryDTO convertToDTO(List<ScanRecord> records) {
        if (records.isEmpty()) {
            return null;
        }

        // 取第一条记录作为基础信息
        ScanRecord first = records.get(0);

        // 计算聚合数据
        long totalQuantity = records.stream()
                .mapToLong(r -> r.getQuantity() != null ? r.getQuantity() : 0)
                .sum();

        BigDecimal totalAmount = records.stream()
                .map(r -> r.getScanCost() != null ? r.getScanCost() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal unitPrice = first.getProcessUnitPrice() != null
                ? first.getProcessUnitPrice()
                : BigDecimal.ZERO;

        PayrollOperatorProcessSummaryDTO dto = new PayrollOperatorProcessSummaryDTO();
        dto.setOperatorId(first.getOperatorId());
        dto.setOperatorName(first.getOperatorName());
        dto.setProcessName(first.getProcessName());
        dto.setQuantity(totalQuantity);
        dto.setUnitPrice(unitPrice);
        dto.setTotalAmount(totalAmount);
        dto.setScanType("production"); // Phase 5 默认为 production
        dto.setRecordCount((long) records.size());

        return dto;
    }

    /**
     * 人员工序汇总 DTO
     */
    @Data
    public static class PayrollOperatorProcessSummaryDTO implements Serializable {
        private static final long serialVersionUID = 1L;

        private String operatorId;
        private String operatorName;
        private String processName;
        private Long quantity;
        private BigDecimal unitPrice;
        private BigDecimal totalAmount;
        private String scanType; // production / cutting
        private Long recordCount; // 扫码次数
    }
}
