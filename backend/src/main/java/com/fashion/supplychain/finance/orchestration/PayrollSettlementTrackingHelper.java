package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Slf4j
@Component
public class PayrollSettlementTrackingHelper {

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionProcessTrackingService processTrackingService;

    @Autowired
    private PayrollSettlementService payrollSettlementService;

    public void markScanRecordsAsSettled(PayrollSettlementQuery q, String settlementId) {
        LocalDateTime now = LocalDateTime.now();

        // 1. 先查询本次结算包含的扫码记录ID集合（精确记录，便于回滚时精确回滚 tracking 状态）
        List<String> scanRecordIds = collectSettledScanRecordIds(q);

        LambdaUpdateWrapper<ScanRecord> uw = new LambdaUpdateWrapper<ScanRecord>()
                .set(ScanRecord::getSettlementStatus, "payroll_settled")
                .set(ScanRecord::getPayrollSettlementId, settlementId)
                .set(ScanRecord::getUpdateTime, now)
                .eq(ScanRecord::getScanResult, "success")
                .gt(ScanRecord::getQuantity, 0)
                .eq(ScanRecord::getTenantId, UserContext.tenantId())
                // P0: 与 selectPayrollAggregation SQL 的 factory_id IS NULL 对齐
                // 排除外发工厂扫码（外发走订单结算，不走内部工资结算）
                // 修复前：按订单结算(不指定 operatorId)时外发记录被误标记为已结算，导致外发撤回被拦截
                .isNull(ScanRecord::getFactoryId);
        if (!q.isIncludeSettled()) {
            uw.and(w -> w.isNull(ScanRecord::getPayrollSettlementId)
                    .or()
                    .eq(ScanRecord::getPayrollSettlementId, ""))
                    .and(w -> w.isNull(ScanRecord::getSettlementStatus)
                            .or()
                            .ne(ScanRecord::getSettlementStatus, "payroll_settled"));
        }
        if (StringUtils.hasText(q.getOrderId())) uw.eq(ScanRecord::getOrderId, q.getOrderId());
        if (StringUtils.hasText(q.getOrderNo())) uw.eq(ScanRecord::getOrderNo, q.getOrderNo());
        if (StringUtils.hasText(q.getStyleNo())) uw.eq(ScanRecord::getStyleNo, q.getStyleNo());
        if (StringUtils.hasText(q.getOperatorId())) uw.eq(ScanRecord::getOperatorId, q.getOperatorId());
        if (StringUtils.hasText(q.getOperatorName())) uw.eq(ScanRecord::getOperatorName, q.getOperatorName());
        if (StringUtils.hasText(q.getScanType())) {
            uw.eq(ScanRecord::getScanType, q.getScanType());
        } else {
            uw.in(ScanRecord::getScanType, Arrays.asList("production", "cutting", "pattern"));
        }
        if (q.getStartTime() != null) uw.ge(ScanRecord::getScanTime, q.getStartTime());
        if (q.getEndTime() != null) uw.le(ScanRecord::getScanTime, q.getEndTime());
        scanRecordMapper.update(null, uw);

        // 将本次结算的扫码记录ID存回结算单（精确追踪）
        if (scanRecordIds != null && !scanRecordIds.isEmpty()) {
            payrollSettlementService.update(new LambdaUpdateWrapper<PayrollSettlement>()
                    .set(PayrollSettlement::getScanRecordIds, String.join(",", scanRecordIds))
                    .eq(PayrollSettlement::getId, settlementId));
        }

        // P1 修复：同步更新 t_production_process_tracking 表的结算字段
        // 原问题：tracking 表 is_settled/settled_at/settled_batch_no/settled_by 字段从未被更新，
        //         导致 ScanUndoHelper.resetTrackingByScanRecord 和 ProductionProcessTrackingOrchestrator.resetScanRecord
        //         的"已结算不可重置"校验失效。
        // P1-2 优化：改为基于 scanRecordIds 精准更新，避免宽泛条件并发风险
        syncTrackingSettlementState(scanRecordIds, q, settlementId, now);
    }

    /**
     * 查询本次工资结算包含的扫码记录ID列表（精确集合，用于回滚）。
     * <p>
     * 查询条件与 markScanRecordsAsSettled 的 UPDATE WHERE 子句保持一致，
     * 仅排除已结算记录（当 includeSettled=false 时）。
     */
    public List<String> collectSettledScanRecordIds(PayrollSettlementQuery q) {
        try {
            LambdaQueryWrapper<ScanRecord> qw = new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getId)
                    .eq(ScanRecord::getScanResult, "success")
                    .gt(ScanRecord::getQuantity, 0)
                    .eq(ScanRecord::getTenantId, UserContext.tenantId())
                    .isNull(ScanRecord::getFactoryId);
            if (!q.isIncludeSettled()) {
                qw.and(w -> w.isNull(ScanRecord::getPayrollSettlementId)
                        .or().eq(ScanRecord::getPayrollSettlementId, ""))
                        .and(w -> w.isNull(ScanRecord::getSettlementStatus)
                                .or().ne(ScanRecord::getSettlementStatus, "payroll_settled"));
            }
            if (StringUtils.hasText(q.getOrderId())) qw.eq(ScanRecord::getOrderId, q.getOrderId());
            if (StringUtils.hasText(q.getOrderNo())) qw.eq(ScanRecord::getOrderNo, q.getOrderNo());
            if (StringUtils.hasText(q.getStyleNo())) qw.eq(ScanRecord::getStyleNo, q.getStyleNo());
            if (StringUtils.hasText(q.getOperatorId())) qw.eq(ScanRecord::getOperatorId, q.getOperatorId());
            if (StringUtils.hasText(q.getOperatorName())) qw.eq(ScanRecord::getOperatorName, q.getOperatorName());
            if (StringUtils.hasText(q.getScanType())) {
                qw.eq(ScanRecord::getScanType, q.getScanType());
            } else {
                qw.in(ScanRecord::getScanType, Arrays.asList("production", "cutting", "pattern"));
            }
            if (q.getStartTime() != null) qw.ge(ScanRecord::getScanTime, q.getStartTime());
            if (q.getEndTime() != null) qw.le(ScanRecord::getScanTime, q.getEndTime());
            List<ScanRecord> records = scanRecordService.list(qw);
            if (records == null) return new ArrayList<>();
            List<String> ids = new ArrayList<>(records.size());
            for (ScanRecord r : records) {
                if (r != null && StringUtils.hasText(r.getId())) ids.add(r.getId());
            }
            return ids;
        } catch (Exception e) {
            log.warn("[PayrollSettle] 查询扫码记录ID集合失败: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    /**
     * 同步 tracking 表的结算字段（与 ScanRecord.settlementStatus 保持一致）。
     * <p>
     * P1-2 优化：改为基于 scanRecordIds 精准更新，彻底解决并发风险。
     * 仅更新本次结算包含的扫码记录对应的 tracking 记录。
     *
     * @param scanRecordIds 本次结算包含的扫码记录ID集合（已精确收集）
     * @param q             结算查询条件（用于兜底：scanRecordIds 为空时按宽泛条件更新）
     * @param settlementId  结算单ID
     * @param now           当前时间
     */
    public void syncTrackingSettlementState(List<String> scanRecordIds, PayrollSettlementQuery q, String settlementId, LocalDateTime now) {
        try {
            String operatorName = UserContext.username();
            Long tenantId = UserContext.tenantId();
            LambdaUpdateWrapper<ProductionProcessTracking> tuw = new LambdaUpdateWrapper<ProductionProcessTracking>()
                    .set(ProductionProcessTracking::getIsSettled, true)
                    .set(ProductionProcessTracking::getSettledAt, now)
                    .set(ProductionProcessTracking::getSettledBatchNo, settlementId)
                    .set(ProductionProcessTracking::getSettledBy, operatorName)
                    .eq(ProductionProcessTracking::getScanStatus, "scanned")
                    .eq(ProductionProcessTracking::getTenantId, tenantId);

            // 优先按 scanRecordIds 精准更新（本次结算已精确收集到的ID）
            if (scanRecordIds != null && !scanRecordIds.isEmpty()) {
                tuw.in(ProductionProcessTracking::getScanRecordId, scanRecordIds);
            } else {
                // 兜底：宽泛条件更新（历史数据或异常场景）
                if (StringUtils.hasText(q.getOrderId())) tuw.eq(ProductionProcessTracking::getProductionOrderId, q.getOrderId());
                if (StringUtils.hasText(q.getOrderNo())) tuw.eq(ProductionProcessTracking::getProductionOrderNo, q.getOrderNo());
                if (q.getStartTime() != null) tuw.ge(ProductionProcessTracking::getScanTime, q.getStartTime());
                if (q.getEndTime() != null) tuw.le(ProductionProcessTracking::getScanTime, q.getEndTime());
                if (StringUtils.hasText(q.getOperatorId())) tuw.eq(ProductionProcessTracking::getOperatorId, q.getOperatorId());
                if (StringUtils.hasText(q.getOperatorName())) tuw.eq(ProductionProcessTracking::getOperatorName, q.getOperatorName());
            }

            processTrackingService.update(tuw);
        } catch (Exception e) {
            log.warn("[PayrollSettle] 同步tracking结算字段失败 settlementId={}: {}", settlementId, e.getMessage());
        }
    }

    /**
     * 根据结算单 scan_record_ids 精确回滚 tracking 表结算状态。
     * <p>
     * 场景：工资结算单取消 / 反向审核时，需要将对应 tracking 记录的 isSettled 等字段
     * 还原，以便后续允许重新结算或扫码撤回。
     * <p>
     * 兜底：若结算单 scanRecordIds 为空（历史数据或异常中断），则按
     * settledBatchNo=settlementId 反查所有 tracking 记录回滚，避免状态永久悬挂。
     */
    public void rollbackTrackingSettlementState(PayrollSettlement settlement) {
        if (settlement == null || !StringUtils.hasText(settlement.getId())) return;
        try {
            Long tenantId = UserContext.tenantId();
            String settlementId = settlement.getId();

            List<String> scanRecordIds = new ArrayList<>();
            if (StringUtils.hasText(settlement.getScanRecordIds())) {
                for (String id : settlement.getScanRecordIds().split(",")) {
                    if (id != null && StringUtils.hasText(id.trim())) scanRecordIds.add(id.trim());
                }
            }

            LambdaUpdateWrapper<ProductionProcessTracking> tuw = new LambdaUpdateWrapper<ProductionProcessTracking>()
                    .set(ProductionProcessTracking::getIsSettled, null)
                    .set(ProductionProcessTracking::getSettledAt, null)
                    .set(ProductionProcessTracking::getSettledBatchNo, null)
                    .set(ProductionProcessTracking::getSettledBy, null)
                    .eq(ProductionProcessTracking::getTenantId, tenantId);

            if (!scanRecordIds.isEmpty()) {
                tuw.in(ProductionProcessTracking::getScanRecordId, scanRecordIds);
            } else {
                tuw.eq(ProductionProcessTracking::getSettledBatchNo, settlementId);
            }

            processTrackingService.update(tuw);
            log.info("[PayrollTrackingRollback] 已回滚 tracking 结算状态: settlementId={}, rollbackBy={}, count~={}",
                    settlementId,
                    !scanRecordIds.isEmpty() ? ("scanRecordIds(" + scanRecordIds.size() + ")") : "settledBatchNo",
                    "N/A");
        } catch (Exception e) {
            log.warn("[PayrollTrackingRollback] tracking 结算状态回滚失败 settlementId={}: {}",
                    settlement.getId(), e.getMessage());
        }
    }
}
