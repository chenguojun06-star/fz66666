package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.service.BillAggregationService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 账单汇总编排器 — 统一收付款账单聚合
 * <p>
 * 核心职责：
 * 1. pushBill() — 各模块审批通过后推送账单（幂等，uk_source去重）
 * 2. listBills() — 分页查询账单列表
 * 3. confirmBill() / batchConfirm() — 账单确认
 * 4. settleBill() — 账单结清
 * 5. cancelBill() — 取消账单
 * 6. getStats() — 统计数据（各状态金额汇总）
 */
@Slf4j
@Service
public class BillAggregationOrchestrator {

    @Autowired
    private BillAggregationService billAggregationService;

    // ==================== 1. 账单推送（各模块调用） ====================

    /**
     * 推送账单到汇总表（幂等 — 基于 source_type + source_id + tenant_id 唯一索引）
     */
    @Transactional(rollbackFor = Exception.class)
    public BillAggregation pushBill(BillPushRequest request) {
        Long tenantId = TenantAssert.requireTenantId();

        // 幂等检查：同来源不重复推送
        BillAggregation existing = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, request.getSourceType())
                .eq(BillAggregation::getSourceId, request.getSourceId())
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .one();
        if (existing != null) {
            log.info("[BillAggregation] 账单已存在，跳过推送: sourceType={}, sourceId={}, billNo={}",
                    request.getSourceType(), request.getSourceId(), existing.getBillNo());
            return existing;
        }

        BillAggregation bill = new BillAggregation();
        bill.setBillNo(generateBillNo());
        bill.setBillType(request.getBillType());
        bill.setBillCategory(request.getBillCategory());
        bill.setSourceType(request.getSourceType());
        bill.setSourceId(request.getSourceId());
        bill.setSourceNo(request.getSourceNo());
        bill.setCounterpartyType(request.getCounterpartyType());
        bill.setCounterpartyId(request.getCounterpartyId());
        bill.setCounterpartyName(request.getCounterpartyName());
        bill.setOrderId(request.getOrderId());
        bill.setOrderNo(request.getOrderNo());
        bill.setStyleNo(request.getStyleNo());
        bill.setAmount(request.getAmount());
        bill.setSettledAmount(BigDecimal.ZERO);
        bill.setStatus("PENDING");
        bill.setSettlementMonth(request.getSettlementMonth());
        bill.setRemark(request.getRemark());
        bill.setCreatorId(UserContext.userId());
        bill.setCreatorName(UserContext.username());
        bill.setTenantId(tenantId);
        bill.setDeleteFlag(0);

        billAggregationService.save(bill);
        log.info("[BillAggregation] 推送账单: billNo={}, type={}, category={}, amount={}, source={}:{}",
                bill.getBillNo(), bill.getBillType(), bill.getBillCategory(),
                bill.getAmount(), bill.getSourceType(), bill.getSourceId());
        return bill;
    }

    // ==================== 2. 查询 ====================

    /**
     * 分页查询账单列表
     */
    public Page<BillAggregation> listBills(BillQueryRequest query) {
        Long tenantId = TenantAssert.requireTenantId();
        Page<BillAggregation> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<BillAggregation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .eq(StringUtils.hasText(query.getBillType()), BillAggregation::getBillType, query.getBillType())
                .eq(StringUtils.hasText(query.getBillCategory()), BillAggregation::getBillCategory, query.getBillCategory())
                .eq(StringUtils.hasText(query.getStatus()), BillAggregation::getStatus, query.getStatus())
                .eq(StringUtils.hasText(query.getSettlementMonth()), BillAggregation::getSettlementMonth, query.getSettlementMonth())
                .like(StringUtils.hasText(query.getCounterpartyName()), BillAggregation::getCounterpartyName, query.getCounterpartyName())
                .like(StringUtils.hasText(query.getOrderNo()), BillAggregation::getOrderNo, query.getOrderNo())
                .orderByDesc(BillAggregation::getCreateTime);

        return billAggregationService.page(page, wrapper);
    }

    /**
     * 统计各状态汇总
     */
    public Map<String, Object> getStats(String billType) {
        Long tenantId = TenantAssert.requireTenantId();
        List<BillAggregation> all = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .eq(StringUtils.hasText(billType), BillAggregation::getBillType, billType)
                .select(BillAggregation::getStatus, BillAggregation::getAmount, BillAggregation::getSettledAmount)
                .list();

        BigDecimal pendingAmount = BigDecimal.ZERO;
        BigDecimal confirmedAmount = BigDecimal.ZERO;
        BigDecimal settledAmount = BigDecimal.ZERO;
        int pendingCount = 0, confirmedCount = 0, settledCount = 0, totalCount = all.size();

        for (BillAggregation b : all) {
            BigDecimal amt = b.getAmount() != null ? b.getAmount() : BigDecimal.ZERO;
            switch (b.getStatus()) {
                case "PENDING":
                    pendingAmount = pendingAmount.add(amt);
                    pendingCount++;
                    break;
                case "CONFIRMED":
                case "SETTLING":
                    confirmedAmount = confirmedAmount.add(amt);
                    confirmedCount++;
                    break;
                case "SETTLED":
                    settledAmount = settledAmount.add(b.getSettledAmount() != null ? b.getSettledAmount() : amt);
                    settledCount++;
                    break;
                default:
                    break;
            }
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("pendingAmount", pendingAmount);
        stats.put("pendingCount", pendingCount);
        stats.put("confirmedAmount", confirmedAmount);
        stats.put("confirmedCount", confirmedCount);
        stats.put("settledAmount", settledAmount);
        stats.put("settledCount", settledCount);
        stats.put("totalCount", totalCount);
        return stats;
    }

    // ==================== 3. 状态流转 ====================

    /**
     * 确认账单（PENDING → CONFIRMED）
     */
    @Transactional(rollbackFor = Exception.class)
    public void confirmBill(String billId) {
        BillAggregation bill = getBillOrThrow(billId);
        if (!"PENDING".equals(bill.getStatus())) {
            throw new RuntimeException("只有待确认状态的账单可以确认");
        }
        bill.setStatus("CONFIRMED");
        bill.setConfirmedById(UserContext.userId());
        bill.setConfirmedByName(UserContext.username());
        bill.setConfirmedAt(LocalDateTime.now());
        billAggregationService.updateById(bill);
        log.info("[BillAggregation] 确认账单: billNo={}", bill.getBillNo());
    }

    /**
     * 批量确认
     */
    @Transactional(rollbackFor = Exception.class)
    public int batchConfirm(List<String> billIds) {
        int count = 0;
        for (String id : billIds) {
            try {
                confirmBill(id);
                count++;
            } catch (Exception e) {
                log.warn("[BillAggregation] 批量确认跳过: id={}, reason={}", id, e.getMessage());
            }
        }
        return count;
    }

    /**
     * 结清账单（CONFIRMED → SETTLED）
     */
    @Transactional(rollbackFor = Exception.class)
    public void settleBill(String billId, BigDecimal settledAmount) {
        BillAggregation bill = getBillOrThrow(billId);
        if (!"CONFIRMED".equals(bill.getStatus()) && !"SETTLING".equals(bill.getStatus())) {
            throw new RuntimeException("只有已确认/结算中的账单可以结清");
        }
        bill.setSettledAmount(settledAmount != null ? settledAmount : bill.getAmount());
        bill.setStatus("SETTLED");
        bill.setSettledById(UserContext.userId());
        bill.setSettledByName(UserContext.username());
        bill.setSettledAt(LocalDateTime.now());
        billAggregationService.updateById(bill);
        log.info("[BillAggregation] 结清账单: billNo={}, amount={}", bill.getBillNo(), bill.getSettledAmount());
    }

    /**
     * 取消账单（PENDING/CONFIRMED → CANCELLED）
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancelBill(String billId, String reason) {
        BillAggregation bill = getBillOrThrow(billId);
        if ("SETTLED".equals(bill.getStatus())) {
            throw new RuntimeException("已结清的账单不可取消");
        }
        bill.setStatus("CANCELLED");
        bill.setRemark(reason);
        billAggregationService.updateById(bill);
        log.info("[BillAggregation] 取消账单: billNo={}, reason={}", bill.getBillNo(), reason);
    }

    // ==================== 内部方法 ====================

    private BillAggregation getBillOrThrow(String billId) {
        BillAggregation bill = billAggregationService.getById(billId);
        if (bill == null || bill.getDeleteFlag() != 0) {
            throw new RuntimeException("账单不存在: " + billId);
        }
        TenantAssert.assertBelongsToCurrentTenant(bill.getTenantId(), "账单");
        return bill;
    }

    private String generateBillNo() {
        return "BA" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS"));
    }

    // ==================== 内部 DTO ====================

    @Data
    public static class BillPushRequest {
        private String billType;       // PAYABLE / RECEIVABLE
        private String billCategory;   // MATERIAL / SHIPMENT / PAYROLL / EXPENSE / ...
        private String sourceType;     // MATERIAL_RECONCILIATION / PAYROLL_SETTLEMENT / ...
        private String sourceId;
        private String sourceNo;
        private String counterpartyType; // SUPPLIER / CUSTOMER / WORKER / FACTORY
        private String counterpartyId;
        private String counterpartyName;
        private String orderId;
        private String orderNo;
        private String styleNo;
        private BigDecimal amount;
        private String settlementMonth;
        private String remark;
    }

    @Data
    public static class BillQueryRequest {
        private int pageNum = 1;
        private int pageSize = 20;
        private String billType;
        private String billCategory;
        private String status;
        private String settlementMonth;
        private String counterpartyName;
        private String orderNo;
    }
}
