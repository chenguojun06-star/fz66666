package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ScanRecordService;
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

        // 工资统计只包含生产和裁剪类型的扫码记录
        // 排除：procurement(采购)、quality(质检领取/验收/入库)、warehouse(仓储)等系统流程记录
        qw.in("scan_type", "production", "cutting");

        // 应用数据权限过滤（根据角色：all=全部, team=团队, own=仅自己）
        DataPermissionHelper.applyOperatorFilter(qw, "operator_id", "operator_name");

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
                .filter(Objects::nonNull)
                .sorted(Comparator
                        .comparing((PayrollOperatorProcessSummaryDTO d) -> d.getOperatorName() != null ? d.getOperatorName() : "",
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(d -> d.getProcessName() != null ? d.getProcessName() : "",
                                Comparator.nullsLast(Comparator.naturalOrder())))
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

        // 优先使用 scanCost，如果为空则使用 quantity * unitPrice 计算
        // 只统计有单价的记录到工资总额（与小程序端一致）
        BigDecimal totalAmount = records.stream()
                .map(r -> {
                    // 优先使用scanCost
                    if (r.getScanCost() != null && r.getScanCost().compareTo(BigDecimal.ZERO) > 0) {
                        return r.getScanCost();
                    }
                    // 如果 scanCost 为空，使用 quantity * unitPrice 计算
                    BigDecimal price = r.getUnitPrice() != null ? r.getUnitPrice() : BigDecimal.ZERO;
                    long qty = r.getQuantity() != null ? r.getQuantity() : 0;
                    // 只有单价>0且数量>0才计入工资
                    if (price.compareTo(BigDecimal.ZERO) > 0 && qty > 0) {
                        return price.multiply(BigDecimal.valueOf(qty));
                    }
                    return BigDecimal.ZERO;
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 优先使用 processUnitPrice，如果为空则使用 unitPrice
        BigDecimal unitPrice = first.getProcessUnitPrice() != null
                ? first.getProcessUnitPrice()
                : (first.getUnitPrice() != null ? first.getUnitPrice() : BigDecimal.ZERO);

        // 获取最早和最晚的扫码时间
        LocalDateTime startTime = records.stream()
                .map(ScanRecord::getScanTime)
                .filter(Objects::nonNull)
                .min(LocalDateTime::compareTo)
                .orElse(null);

        LocalDateTime endTime = records.stream()
                .map(ScanRecord::getScanTime)
                .filter(Objects::nonNull)
                .max(LocalDateTime::compareTo)
                .orElse(null);

        PayrollOperatorProcessSummaryDTO dto = new PayrollOperatorProcessSummaryDTO();
        dto.setOrderNo(first.getOrderNo());
        dto.setStyleNo(first.getStyleNo());
        dto.setColor(first.getColor());
        dto.setSize(first.getSize());
        dto.setOperatorId(first.getOperatorId());
        dto.setOperatorName(first.getOperatorName());
        dto.setProcessName(first.getProcessName());
        dto.setQuantity(totalQuantity);
        dto.setUnitPrice(unitPrice);
        dto.setTotalAmount(totalAmount);
        dto.setScanType("production"); // Phase 5 默认为 production
        dto.setRecordCount((long) records.size());
        dto.setStartTime(startTime);
        dto.setEndTime(endTime);

        // Phase 6: 填充指派信息（从第一条记录获取）
        dto.setDelegateTargetType(first.getDelegateTargetType());
        dto.setDelegateTargetName(first.getDelegateTargetName());
        dto.setActualOperatorName(first.getActualOperatorName());

        return dto;
    }

    /**
     * 人员工序汇总 DTO
     */
    @Data
    public static class PayrollOperatorProcessSummaryDTO implements Serializable {
        private static final long serialVersionUID = 1L;

        private String orderNo;      // 订单号
        private String styleNo;      // 款号
        private String color;        // 颜色
        private String size;         // 尺码
        private String operatorId;
        private String operatorName;
        private String processName;
        private Long quantity;
        private BigDecimal unitPrice;
        private BigDecimal totalAmount;
        private String scanType; // production / cutting
        private Long recordCount; // 扫码次数
        private LocalDateTime startTime;  // 开始时间（最早扫码时间）
        private LocalDateTime endTime;    // 完成时间（最晚扫码时间）

        // Phase 6新增：指派相关字段
        private String delegateTargetType;   // 指派类型: internal/external/none
        private String delegateTargetName;   // 被指派人/工厂名称
        private String actualOperatorName;   // 实际操作员（谁扫的码）
    }
}
