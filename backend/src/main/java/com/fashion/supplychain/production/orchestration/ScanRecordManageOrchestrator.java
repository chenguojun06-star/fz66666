package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 录入记录管理编排器（D-473 数据录入管理页后端）。
 *
 * <p>定位：扫码/录入记录流水的统一查询与修正入口——数据录错时在页面直接改，
 * 改完自然回流（进度/菲号报工统计全部由 t_scan_record 实时聚合推导，无需额外写回）。
 * 三条铁律：
 * ① 已参与工资结算的记录禁止改/删（先到工资结算撤销）；
 * ② 样衣镜像记录（scanType=pattern）禁止在此删除——原生记录在样衣生产，须走样衣撤回联动；
 * ③ 每次修改/撤回写 t_operation_log 留痕（含旧值快照）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ScanRecordManageOrchestrator {

    private static final Set<String> SETTLED_STATUSES = Set.of("payroll_settled", "payroll_approved");

    private final ScanRecordService scanRecordService;
    private final com.fashion.supplychain.production.helper.ScanRecordEnrichHelper scanRecordEnrichHelper;
    private final ProductionOrderService productionOrderService;
    private final OperationLogService operationLogService;

    // ==================== 查询 ====================

    public Map<String, Object> list(ScanRecordManageQuery query) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        Page<ScanRecord> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ScanRecord::getTenantId, tenantId)
                .eq(ScanRecord::getScanResult, "success")
                .orderByDesc(ScanRecord::getScanTime)
                .orderByDesc(ScanRecord::getCreateTime);

        String keyword = StringUtils.hasText(query.getKeyword()) ? query.getKeyword().trim() : null;
        if (keyword != null) {
            // 通用搜索：一框覆盖 单号/款号/工序/记录员/备注/颜色/尺码
            wrapper.and(w -> w.like(ScanRecord::getOrderNo, keyword)
                    .or().like(ScanRecord::getStyleNo, keyword)
                    .or().like(ScanRecord::getProcessName, keyword)
                    .or().like(ScanRecord::getOperatorName, keyword)
                    .or().like(ScanRecord::getRemark, keyword)
                    .or().like(ScanRecord::getColor, keyword)
                    .or().like(ScanRecord::getSize, keyword));
        }
        wrapper.eq(StringUtils.hasText(query.getScanType()), ScanRecord::getScanType, query.getScanType());
        if (StringUtils.hasText(query.getSettlementStatus())) {
            if ("UNSETTLED".equals(query.getSettlementStatus())) {
                wrapper.and(w -> w.and(x -> x.isNull(ScanRecord::getPayrollSettlementId)
                                .or().eq(ScanRecord::getPayrollSettlementId, ""))
                        .and(x -> x.isNull(ScanRecord::getSettlementStatus)
                                .or().notIn(ScanRecord::getSettlementStatus, SETTLED_STATUSES)));
            } else if ("SETTLED".equals(query.getSettlementStatus())) {
                wrapper.and(w -> w.isNotNull(ScanRecord::getPayrollSettlementId).ne(ScanRecord::getPayrollSettlementId, "")
                        .or().in(ScanRecord::getSettlementStatus, SETTLED_STATUSES));
            }
        }
        if (StringUtils.hasText(query.getStartDate())) {
            LocalDate start = LocalDate.parse(query.getStartDate().trim());
            wrapper.ge(ScanRecord::getScanTime, start.atStartOfDay());
        }
        if (StringUtils.hasText(query.getEndDate())) {
            LocalDate end = LocalDate.parse(query.getEndDate().trim());
            wrapper.le(ScanRecord::getScanTime, end.atTime(23, 59, 59));
        }

        Page<ScanRecord> result = scanRecordService.page(page, wrapper);
        List<ScanRecord> records = result.getRecords();

        // 补款式名称/封面（复用既有 enrich helper，t_scan_record 无 style_name 列）
        scanRecordEnrichHelper.enrichStyleInfo(records);
        List<Map<String, Object>> rows = records.stream().map(r -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", r.getId());
            row.put("orderId", r.getOrderId());
            row.put("orderNo", r.getOrderNo());
            row.put("styleNo", r.getStyleNo());
            row.put("styleName", r.getStyleName());
            row.put("coverImage", r.getCoverImage());
            row.put("color", r.getColor());
            row.put("size", r.getSize());
            row.put("scanType", r.getScanType());
            row.put("processName", r.getProcessName());
            row.put("progressStage", r.getProgressStage());
            row.put("quantity", r.getQuantity());
            row.put("unitPrice", r.getProcessUnitPrice() != null ? r.getProcessUnitPrice() : r.getUnitPrice());
            row.put("totalAmount", r.getTotalAmount() != null ? r.getTotalAmount() : r.getScanCost());
            row.put("operatorName", r.getOperatorName());
            row.put("remark", r.getRemark());
            row.put("bundleNo", r.getCuttingBundleNo());
            row.put("cuttingBundleNo", r.getCuttingBundleNo());
            row.put("settlementStatus", resolveSettlementStatus(r));
            row.put("scanTime", r.getScanTime() != null ? r.getScanTime() : r.getCreateTime());
            return row;
        }).collect(Collectors.toList());

        Map<String, Object> data = new HashMap<>();
        data.put("records", rows);
        data.put("total", result.getTotal());
        return data;
    }

    private String resolveSettlementStatus(ScanRecord r) {
        if (StringUtils.hasText(r.getPayrollSettlementId()) || SETTLED_STATUSES.contains(r.getSettlementStatus())) {
            return "SETTLED";
        }
        return "UNSETTLED";
    }

    // ==================== 修改（回流=统计实时推导，改记录即改账） ====================

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> update(String id, Integer quantity, String remark) {
        ScanRecord record = getManageableRecord(id);
        assertNotSettled(record);

        Map<String, Object> before = snapshot(record);
        BigDecimal unitPrice = record.getProcessUnitPrice() != null && record.getProcessUnitPrice().compareTo(BigDecimal.ZERO) > 0
                ? record.getProcessUnitPrice()
                : (record.getUnitPrice() != null ? record.getUnitPrice() : BigDecimal.ZERO);

        StringBuilder change = new StringBuilder();
        if (quantity != null) {
            if (quantity <= 0) {
                throw new IllegalArgumentException("数量必须大于0；要作废这条记录请使用撤回");
            }
            if (!quantity.equals(record.getQuantity())) {
                change.append("数量 ").append(record.getQuantity()).append("→").append(quantity).append("；");
                record.setQuantity(quantity);
                BigDecimal amount = unitPrice.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);
                record.setTotalAmount(amount);
                record.setScanCost(amount);
            }
        }
        if (remark != null && !remark.equals(record.getRemark())) {
            change.append("备注 \"").append(nullToEmpty(record.getRemark())).append("\"→\"").append(remark.trim()).append("\"");
            record.setRemark(remark.trim());
        }
        if (change.length() == 0) {
            throw new IllegalArgumentException("没有需要修改的内容");
        }
        record.setUpdateTime(LocalDateTime.now());
        scanRecordService.updateById(record);

        appendLog(record, "修改录入记录", change.toString(), before);
        log.info("[录入记录管理] 修改: id={}, orderNo={}, {}", id, record.getOrderNo(), change);

        Map<String, Object> result = new HashMap<>();
        result.put("id", record.getId());
        result.put("quantity", record.getQuantity());
        result.put("totalAmount", record.getTotalAmount());
        return result;
    }

    // ==================== 撤回（删除重做） ====================

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> delete(String id, String reason) {
        ScanRecord record = getManageableRecord(id);
        assertNotSettled(record);
        if ("pattern".equals(record.getScanType())) {
            throw new IllegalStateException("样衣录入记录请到样衣生产页撤回（需联动回滚样衣侧工序状态）");
        }

        Map<String, Object> before = snapshot(record);
        scanRecordService.removeById(record.getId());
        appendLog(record, "撤回录入记录",
                "整条撤回" + (StringUtils.hasText(reason) ? "，原因：" + reason.trim() : "") + "；数量 "
                        + record.getQuantity() + "，金额 " + record.getTotalAmount(),
                before);
        log.info("[录入记录管理] 撤回: id={}, orderNo={}, scanType={}, quantity={}",
                id, record.getOrderNo(), record.getScanType(), record.getQuantity());

        Map<String, Object> result = new HashMap<>();
        result.put("deleted", true);
        return result;
    }

    // ==================== 日志 ====================

    public List<OperationLog> logs(String id) {
        TenantAssert.assertTenantContext();
        return operationLogService.lambdaQuery()
                .eq(OperationLog::getTargetType, "scan_record")
                .eq(OperationLog::getTargetId, id)
                .orderByDesc(OperationLog::getOperationTime)
                .last("LIMIT 50")
                .list();
    }

    // ==================== 内部工具 ====================

    private ScanRecord getManageableRecord(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("记录ID不能为空");
        }
        TenantAssert.assertTenantContext();
        ScanRecord record = scanRecordService.getById(id.trim());
        if (record == null) {
            throw new IllegalArgumentException("录入记录不存在或已被撤回");
        }
        TenantAssert.assertBelongsToCurrentTenant(record.getTenantId(), "录入记录");
        return record;
    }

    /** 铁律①：已参与工资结算的记录不允许改/删——先到工资结算反向审核/撤销释放记录 */
    private void assertNotSettled(ScanRecord record) {
        if (StringUtils.hasText(record.getPayrollSettlementId()) || SETTLED_STATUSES.contains(record.getSettlementStatus())) {
            throw new IllegalStateException("该录入记录已参与工资结算，请先在工资结算中反向审核/撤销后再操作");
        }
    }

    private Map<String, Object> snapshot(ScanRecord r) {
        Map<String, Object> snap = new LinkedHashMap<>();
        snap.put("orderNo", r.getOrderNo());
        snap.put("styleNo", r.getStyleNo());
        snap.put("processName", r.getProcessName());
        snap.put("scanType", r.getScanType());
        snap.put("quantity", r.getQuantity());
        snap.put("unitPrice", r.getProcessUnitPrice() != null ? r.getProcessUnitPrice() : r.getUnitPrice());
        snap.put("totalAmount", r.getTotalAmount());
        snap.put("operatorName", r.getOperatorName());
        snap.put("remark", r.getRemark());
        snap.put("scanTime", r.getScanTime());
        return snap;
    }

    private void appendLog(ScanRecord record, String operation, String details, Map<String, Object> before) {
        try {
            OperationLog logEntry = new OperationLog();
            logEntry.setModule("生产");
            logEntry.setOperation(operation);
            logEntry.setOperatorId(parseLongSafe(UserContext.userId()));
            logEntry.setOperatorName(UserContext.username());
            logEntry.setTargetType("scan_record");
            logEntry.setTargetId(record.getId());
            logEntry.setTargetName(record.getOrderNo());
            logEntry.setDetails(details + "；快照 " + before);
            logEntry.setOperationTime(LocalDateTime.now());
            logEntry.setStatus("success");
            logEntry.setTenantId(record.getTenantId());
            operationLogService.save(logEntry);
        } catch (Exception e) {
            log.warn("[录入记录管理] 写操作日志失败（不阻塞主流程）: id={}, err={}", record.getId(), e.getMessage());
        }
    }

    private Long parseLongSafe(String s) {
        try {
            return StringUtils.hasText(s) ? Long.parseLong(s.trim()) : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    /** 查询入参 */
    @lombok.Data
    public static class ScanRecordManageQuery {
        private int pageNum = 1;
        private int pageSize = 20;
        private String keyword;          // 通用搜索：单号/款号/工序/记录员/备注/颜色/尺码/菲号
        private String scanType;         // production/cutting/quality/warehouse/pattern
        private String settlementStatus; // UNSETTLED / SETTLED
        private String startDate;        // yyyy-MM-dd
        private String endDate;          // yyyy-MM-dd
    }
}
