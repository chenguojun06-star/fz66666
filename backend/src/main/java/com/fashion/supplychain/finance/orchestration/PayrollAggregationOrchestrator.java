package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.Data;
import org.springframework.stereotype.Component;
import org.springframework.util.DigestUtils;

import java.nio.charset.StandardCharsets;
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
    private final ProductionOrderService productionOrderService;

    public PayrollAggregationOrchestrator(ScanRecordService scanRecordService,
                                          ProductionOrderService productionOrderService) {
        this.scanRecordService = scanRecordService;
        this.productionOrderService = productionOrderService;
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

        Long tenantId = TenantAssert.requireTenantId();
        qw.eq("tenant_id", tenantId);

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

        // ★ 关键：只统计成功的扫码记录，排除失败/取消记录，否则会导致工资页金额高于实际
        qw.eq("scan_result", "success");
        qw.gt("quantity", 0);

        // 工资统计包含生产类、裁剪类、样衣类的扫码记录
        // 排除：procurement(采购)、quality(质检领取/验收/入库)、warehouse(仓储)、orchestration(系统编排)等系统流程记录
        // orchestration = 系统编排层自动生成的记录，不是真实扫码，按规则5必须排除
        // pattern = 样衣扫码记录（领取样板/车板扫码/完成确认等），应计入工资
        qw.in("scan_type", "production", "cutting", "pattern");

        // ★ 关键：工资结算(内)只统计本厂内部员工的扫码记录
        // factory_id IS NULL = 本厂内部账号扫码；factory_id 非空 = 外发工厂账号扫码（走订单结算）
        // 此过滤对所有角色（管理员/老板/工厂账号）均有效，彻底阻止外发工厂数据进入内部工资结算
        qw.isNull("factory_id");

        // 防御性过滤：排除系统编排阶段（采购/下单等）历史遗留 scan_type='production' 记录，
        // 防止这些 ¥0.00 记录出现在小程序「我的工资」页面。
        // 根本修复在 ProductionOrderScanRecordDomainService.isSystemStage()，此处为双保险。
        qw.notIn("progress_stage", "下单", "采购", "物料采购", "面辅料采购",
                "备料", "到料", "订单创建", "创建订单", "开单", "制单");

        // 查询扫码记录（安全上限，防止无限制全表扫描）
        qw.last("LIMIT 5000");
        List<ScanRecord> scanRecords = scanRecordService.list(qw);

        // 按 operator_id + order_id + process_name + color + size 分组
        // ★ 必须含 orderId：否则同一工人对不同订单做同名工序时，数量会被错误累加到第一个订单上
        //    旧 key（只有 operatorId+processName）导致：李老板所有订单的"采购"扫码 → 合并成一行 2553 件
        // ★ 含 color+size：同一订单不同颜色/尺码的扫码记录分开显示，与 PC 端工资结算行一一对应
        Map<String, List<ScanRecord>> grouped = scanRecords.stream()
                .collect(Collectors.groupingBy(
                        record -> {
                            String oid = record.getOperatorId() != null ? record.getOperatorId() : "";
                            String ordId = record.getOrderId() != null ? record.getOrderId() : "";
                            String pn = record.getProcessName() != null ? record.getProcessName() : "";
                            String color = record.getColor() != null ? record.getColor() : "";
                            String size = record.getSize() != null ? record.getSize() : "";
                            return oid + "|" + ordId + "|" + pn + "|" + color + "|" + size;
                        },
                        Collectors.toList()
                ));

        // 转换为 DTO
        List<PayrollOperatorProcessSummaryDTO> dtoList = grouped.values().stream()
                .map(this::convertToDTO)
                .filter(Objects::nonNull)
                .sorted(Comparator
                        .comparing((PayrollOperatorProcessSummaryDTO d) -> d.getOperatorName() != null ? d.getOperatorName() : "",
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(d -> d.getProcessName() != null ? d.getProcessName() : "",
                                Comparator.nullsLast(Comparator.naturalOrder())))
                .collect(Collectors.toList());

        // 批量回填订单状态（关单审核条件需要）
        Set<String> orderNos = dtoList.stream()
                .map(PayrollOperatorProcessSummaryDTO::getOrderNo)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (!orderNos.isEmpty()) {
            QueryWrapper<ProductionOrder> orderQw = new QueryWrapper<>();
            orderQw.in("order_no", orderNos);
            orderQw.eq("tenant_id", tenantId);
            orderQw.last("LIMIT 5000");
            Map<String, String> orderNoToStatus = productionOrderService.list(orderQw).stream()
                    .collect(Collectors.toMap(
                            ProductionOrder::getOrderNo,
                            o -> o.getStatus() != null ? o.getStatus() : "",
                            (a, b) -> a));
            dtoList.forEach(d -> {
                if (d.getOrderNo() != null) {
                    d.setOrderStatus(orderNoToStatus.getOrDefault(d.getOrderNo(), ""));
                }
            });
        }

        return dtoList;
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

        // 金额优先级：total_amount → scanCost → unitPrice × quantity
        // 与 selectPersonalStats SQL 保持一致：COALESCE(NULLIF(total_amount,0), NULLIF(scan_cost,0), unit_price*quantity, 0)
        BigDecimal totalAmount = records.stream()
                .map(r -> {
                    // 优先使用 totalAmount（已写入DB的最终金额）
                    if (r.getTotalAmount() != null && r.getTotalAmount().compareTo(BigDecimal.ZERO) > 0) {
                        return r.getTotalAmount();
                    }
                    // 其次使用 scanCost（工序单价×数量）
                    if (r.getScanCost() != null && r.getScanCost().compareTo(BigDecimal.ZERO) > 0) {
                        return r.getScanCost();
                    }
                    // 兜底：unitPrice × quantity
                    BigDecimal price = r.getUnitPrice() != null ? r.getUnitPrice() : BigDecimal.ZERO;
                    long qty = r.getQuantity() != null ? r.getQuantity() : 0;
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
        dto.setOrderId(first.getOrderId());
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
        String dominantScanType = records.stream()
                .map(ScanRecord::getScanType)
                .filter(Objects::nonNull)
                .collect(Collectors.groupingBy(st -> st, Collectors.counting()))
                .entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("production");
        dto.setScanType(dominantScanType);
        dto.setRecordCount((long) records.size());
        dto.setStartTime(startTime);
        dto.setEndTime(endTime);
        dto.setApprovalId(buildDetailApprovalId(first));

        // Phase 6: 填充指派信息（从第一条记录获取）
        dto.setDelegateTargetType(first.getDelegateTargetType());
        dto.setDelegateTargetName(first.getDelegateTargetName());
        dto.setActualOperatorName(first.getActualOperatorName());

        return dto;
    }

    private String buildDetailApprovalId(ScanRecord record) {
        Long tenantId = UserContext.tenantId();
        String rawKey = String.join("|",
                tenantId == null ? "0" : String.valueOf(tenantId),
                safePart(record.getOrderId()),
                safePart(record.getOrderNo()),
                safePart(record.getStyleNo()),
                safePart(record.getColor()),
                safePart(record.getSize()),
                safePart(record.getOperatorId()),
                safePart(record.getProcessName()));
        return "PAY_" + DigestUtils.md5DigestAsHex(rawKey.getBytes(StandardCharsets.UTF_8));
    }

    private String safePart(String value) {
        return value == null ? "" : value.trim();
    }

    /**
     * 人员工序汇总 DTO
     */
    @Data
    public static class PayrollOperatorProcessSummaryDTO implements Serializable {
        private static final long serialVersionUID = 1L;

        private String orderId;
        private String orderNo;
        private String orderStatus;
        private String styleNo;
        private String color;
        private String size;
        private String operatorId;
        private String operatorName;
        private String processName;
        private Long quantity;
        private BigDecimal unitPrice;
        private BigDecimal totalAmount;
        private String scanType;
        private Long recordCount;
        private LocalDateTime startTime;
        private LocalDateTime endTime;

        /** 明细审核唯一键（稳定哈希，跨刷新一致） */
        private String approvalId;

        /** 审核状态：pending/approved */
        private String approvalStatus;

        private String delegateTargetType;
        private String delegateTargetName;
        private String actualOperatorName;
    }
}
