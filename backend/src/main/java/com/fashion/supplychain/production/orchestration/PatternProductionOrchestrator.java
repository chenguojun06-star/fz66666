package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.PatternScanRecord;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.helper.PatternEnrichmentHelper;
import com.fashion.supplychain.production.helper.PatternStatusHelper;
import com.fashion.supplychain.production.helper.PatternStockHelper;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.PatternScanRecordService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 样板生产编排器
 * <p>
 * 编排跨服务调用：样板生产、款式信息、款式工序、物料采购、扫码记录
 * 具体私有逻辑已委托给 PatternEnrichmentHelper / PatternStockHelper / PatternStatusHelper
 */
@Slf4j
@Service
public class PatternProductionOrchestrator {

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private PatternScanRecordService patternScanRecordService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PatternEnrichmentHelper enrichmentHelper;

    @Autowired
    private PatternStockHelper stockHelper;

    @Autowired
    private PatternStatusHelper statusHelper;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private com.fashion.supplychain.style.service.StyleProcessService styleProcessService;

    @Autowired(required = false)
    private com.fashion.supplychain.system.service.OrderRemarkService orderRemarkService;

    /**
     * 分页查询并丰富样板生产记录（关联款式、工序、采购数据）
     * <p>
     * 支持 status=OVERDUE/WARNING 的虚拟状态筛选，由后端根据交期统一过滤并分页，
     * 避免前端本地过滤导致分页错乱。
     */
    public Map<String, Object> listWithEnrichment(int page, int size, String keyword, String status,
                                                   String startDate, String endDate) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        boolean isDueFilter = "OVERDUE".equalsIgnoreCase(status) || "WARNING".equalsIgnoreCase(status);

        // 构建查询条件
        LambdaQueryWrapper<PatternProduction> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternProduction::getTenantId, tenantId)
                .eq(PatternProduction::getDeleteFlag, 0);

        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(PatternProduction::getStyleNo, keyword)
                    .or().like(PatternProduction::getColor, keyword)
                    .or().like(PatternProduction::getPatternMaker, keyword));
        }
        if (StringUtils.hasText(status) && !isDueFilter) {
            wrapper.eq(PatternProduction::getStatus, status);
        }
        if (StringUtils.hasText(startDate)) {
            wrapper.ge(PatternProduction::getCreateTime, startDate + " 00:00:00");
        }
        if (StringUtils.hasText(endDate)) {
            wrapper.le(PatternProduction::getCreateTime, endDate + " 23:59:59");
        }
        wrapper.orderByDesc(PatternProduction::getCreateTime);

        Page<PatternProduction> pageResult = patternProductionService.page(new Page<>(page, size), wrapper);

        // 丰富每条记录
        List<Map<String, Object>> enrichedRecords = pageResult.getRecords().stream()
                .map(enrichmentHelper::enrichRecord)
                .collect(Collectors.toList());

        // OVERDUE/WARNING 是虚拟状态，需要按交期二次过滤并重新分页
        if (isDueFilter) {
            enrichedRecords = filterByDueDate(enrichedRecords, status.toUpperCase());
            return paginateManually(enrichedRecords, page, size);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("records", enrichedRecords);
        result.put("total", pageResult.getTotal());
        result.put("size", pageResult.getSize());
        result.put("current", pageResult.getCurrent());
        result.put("pages", pageResult.getPages());
        return result;
    }

    /**
     * 按交期过滤记录（OVERDUE：已延期，WARNING：3天内到期）
     */
    private List<Map<String, Object>> filterByDueDate(List<Map<String, Object>> records, String status) {
        java.time.LocalDate today = java.time.LocalDate.now();
        return records.stream().filter(m -> {
            String recordStatus = String.valueOf(m.get("status") == null ? "" : m.get("status")).trim().toUpperCase();
            // 排除已完成/已入库/已报废
            if ("COMPLETED".equals(recordStatus) || "WAREHOUSE_IN".equals(recordStatus)
                    || "SCRAPPED".equals(recordStatus)) {
                return false;
            }
            java.time.LocalDate deliveryDate = resolveDeliveryDate(m);
            if (deliveryDate == null) {
                return false;
            }
            long diffDays = java.time.temporal.ChronoUnit.DAYS.between(today, deliveryDate);
            if ("OVERDUE".equals(status)) {
                return diffDays < 0;
            }
            return diffDays >= 0 && diffDays <= 3;
        }).collect(Collectors.toList());
    }

    /**
     * 解析记录的交期：优先使用 PatternProduction.deliveryTime，其次 StyleInfo.deliveryDate
     */
    private java.time.LocalDate resolveDeliveryDate(Map<String, Object> record) {
        Object deliveryTime = record.get("deliveryTime");
        if (deliveryTime instanceof String && StringUtils.hasText((String) deliveryTime)) {
            try {
                String s = ((String) deliveryTime).trim();
                if (s.length() > 10) {
                    s = s.substring(0, 10);
                }
                return java.time.LocalDate.parse(s);
            } catch (Exception e) {
                log.debug("解析 deliveryTime 失败: {}", deliveryTime);
            }
        }
        Object styleInfoObj = record.get("styleInfo");
        if (styleInfoObj instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> styleInfo = (Map<String, Object>) styleInfoObj;
            Object deliveryDate = styleInfo.get("deliveryDate");
            if (deliveryDate instanceof String && StringUtils.hasText((String) deliveryDate)) {
                try {
                    String s = ((String) deliveryDate).trim();
                    if (s.length() > 10) {
                        s = s.substring(0, 10);
                    }
                    return java.time.LocalDate.parse(s);
                } catch (Exception e) {
                    log.debug("解析 styleInfo.deliveryDate 失败: {}", deliveryDate);
                }
            }
        }
        return null;
    }

    /**
     * 手动分页（用于虚拟状态筛选后）
     */
    private Map<String, Object> paginateManually(List<Map<String, Object>> records, int page, int size) {
        int total = records.size();
        int pages = (int) Math.ceil((double) total / Math.max(size, 1));
        int from = (page - 1) * size;
        int to = Math.min(from + size, total);
        List<Map<String, Object>> pageRecords = from < total ? records.subList(from, to) : java.util.Collections.emptyList();

        Map<String, Object> result = new HashMap<>();
        result.put("records", pageRecords);
        result.put("total", total);
        result.put("size", size);
        result.put("current", page);
        result.put("pages", pages);
        return result;
    }

    /**
     * 样衣开发统计（与 PC 端 StyleInfoList activeStyles 逻辑一致）
     * <p>
     * activeCount：开发中（排除已归档/已报废/样衣完成/开发样报废/审核通过）
     * overdueCount：已延期（活跃款式中 deliveryDate 已过）
     * warningCount：临近交期（活跃款式中 deliveryDate 在 3 天内，含今天）
     */
    public Map<String, Object> calcSampleStats() {
        // 查询所有未删除的样衣生产记录
        LambdaQueryWrapper<PatternProduction> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternProduction::getDeleteFlag, 0);
        List<PatternProduction> allPatterns = patternProductionService.list(wrapper);

        // 收集关联的 styleId，批量查询 StyleInfo（StyleInfo.id 是 Long，PatternProduction.styleId 是 String）
        List<Long> styleIds = allPatterns.stream()
                .map(PatternProduction::getStyleId)
                .filter(id -> id != null && !id.isEmpty())
                .map(id -> {
                    try { return Long.valueOf(id); } catch (NumberFormatException e) { return null; }
                })
                .filter(id -> id != null)
                .distinct()
                .collect(Collectors.toList());
        Map<String, StyleInfo> styleMap = new HashMap<>();
        if (!styleIds.isEmpty()) {
            List<StyleInfo> styles = styleInfoService.listByIds(styleIds);
            for (StyleInfo s : styles) {
                styleMap.put(String.valueOf(s.getId()), s);
            }
        }

        // 与 PC 端 activeStyles 逻辑一致：区分 active / completed / overdue / warning
        int activeCount = 0;
        int completedCount = 0;
        int overdueCount = 0;
        int warningCount = 0;
        java.time.LocalDate today = java.time.LocalDate.now();

        for (PatternProduction p : allPatterns) {
            StyleInfo s = styleMap.get(p.getStyleId());
            // 合并 pattern 和 styleInfo 的状态字段
            String styleStatus = s != null ? String.valueOf(s.getStatus()).trim().toLowerCase() : "";
            String progressNode = s != null ? String.valueOf(s.getProgressNode() != null ? s.getProgressNode() : "").trim() : "";
            String sampleStatus = s != null ? String.valueOf(s.getSampleStatus() != null ? s.getSampleStatus() : "").trim().toUpperCase() : "";
            String sampleReviewStatus = s != null ? String.valueOf(s.getSampleReviewStatus() != null ? s.getSampleReviewStatus() : "").trim().toUpperCase() : "";
            String patternStatus = String.valueOf(p.getStatus()).trim().toUpperCase();

            // 已完成：sampleStatus = COMPLETED/WAREHOUSE_IN 或 progressNode = 样衣完成
            //        或 pattern status = COMPLETED/WAREHOUSE_IN
            boolean isCompleted =
                "COMPLETED".equals(sampleStatus)
                || "WAREHOUSE_IN".equals(sampleStatus)
                || "样衣完成".equals(progressNode)
                || "COMPLETED".equals(patternStatus)
                || "WAREHOUSE_IN".equals(patternStatus);

            // 排除：已报废 / 已归档 / 开发样报废 / 审核通过（审核通过 = 完成了样衣流程）
            boolean isExcluded =
                "archived".equals(styleStatus)
                || "scrapped".equals(styleStatus)
                || "开发样报废".equals(progressNode)
                || "PASS".equals(sampleReviewStatus)
                || "APPROVED".equals(sampleReviewStatus);

            if (isExcluded) continue;

            if (isCompleted) {
                completedCount++;
                continue;
            }

            // 通过所有排除条件且未完成 → 活跃款式
            activeCount++;

            // 计算延期/临近交期（优先用 styleInfo.deliveryDate，其次 pattern.deliveryTime）
            java.time.LocalDate deliveryDate = null;
            if (s != null && s.getDeliveryDate() != null) {
                deliveryDate = s.getDeliveryDate().toLocalDate();
            } else if (p.getDeliveryTime() != null) {
                deliveryDate = p.getDeliveryTime().toLocalDate();
            }
            if (deliveryDate != null) {
                long diffDays = java.time.temporal.ChronoUnit.DAYS.between(today, deliveryDate);
                if (diffDays < 0) {
                    overdueCount++;
                } else if (diffDays <= 3) {
                    warningCount++;
                }
            }
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("activeCount", activeCount);
        stats.put("completedCount", completedCount);
        stats.put("overdueCount", overdueCount);
        stats.put("warningCount", warningCount);
        // 全部款号 = 开发中 + 已完成（已排除报废/归档/审核通过的不计入）
        stats.put("totalCount", activeCount + completedCount);
        return stats;
    }

    /**
     * 领取样板（跨域更新：PatternProduction + StyleInfo）
     */
    @Transactional(rollbackFor = Exception.class)
    public String receivePattern(String id, Map<String, Object> params) {
        PatternProduction record = getPatternWithTenant(id);
        if (record == null || record.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("记录不存在");
        }
        if (!"PENDING".equals(record.getStatus())) {
            throw new IllegalStateException("当前状态不允许领取");
        }

        String currentUser = UserContext.username();
        record.setReceiver(currentUser);
        record.setReceiveTime(LocalDateTime.now());
        record.setStatus("IN_PROGRESS");
        record.setUpdateBy(currentUser);
        record.setUpdateTime(LocalDateTime.now());
        record.setPatternMaker(currentUser);

        if (params != null) {
            parseAndSetTime(params, "releaseTime", record);
            parseAndSetTime(params, "deliveryTime", record);
            if (params.containsKey("color") && params.get("color") != null) {
                String color = String.valueOf(params.get("color")).trim();
                if (StringUtils.hasText(color)) {
                    record.setColor(color);
                }
            }
            if (params.containsKey("quantity") && params.get("quantity") != null) {
                try {
                    int qty = Integer.parseInt(String.valueOf(params.get("quantity")).trim());
                    if (qty > 0) {
                        record.setQuantity(qty);
                    }
                } catch (NumberFormatException ignore) {}
            }
        }

        patternProductionService.updateById(record);

        // 创建样衣领取扫码记录，使前端工序进度能匹配"采购"阶段
        PatternScanRecord receiveRecord = new PatternScanRecord();
        receiveRecord.setPatternProductionId(id);
        receiveRecord.setStyleId(record.getStyleId());
        receiveRecord.setStyleNo(record.getStyleNo());
        receiveRecord.setColor(record.getColor());
        receiveRecord.setOperationType("RECEIVE");
        receiveRecord.setProcessName(patternOperationLabel("RECEIVE"));
        receiveRecord.setProgressStage(mapOperationTypeToProgressStage("RECEIVE"));
        receiveRecord.setProcessCode("RECEIVE");
        receiveRecord.setOperatorId(UserContext.userId());
        receiveRecord.setOperatorName(currentUser);
        receiveRecord.setOperatorRole("PLATE_WORKER");
        receiveRecord.setScanTime(LocalDateTime.now());
        receiveRecord.setRemark("领取样板");
        receiveRecord.setCreateTime(LocalDateTime.now());
        receiveRecord.setDeleteFlag(0);
        patternScanRecordService.save(receiveRecord);

        createPatternScanRecordForWage(record, "领取样板", UserContext.userId(), currentUser, LocalDateTime.now());

        statusHelper.syncStyleInfoOnReceive(record.getStyleId(), currentUser);
        statusHelper.syncStyleInfoSampleStage(record);

        log.info("Pattern production received: id={}, receiver={}", id, currentUser);
        return "领取成功";
    }

    /**
     * 更新工序进度（跨域更新：PatternProduction + StyleInfo）
     */
    @Transactional(rollbackFor = Exception.class)
    public String updateProgress(String id, Map<String, Integer> progressNodes) {
        PatternProduction record = getPatternWithTenant(id);
        if (record == null || record.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("记录不存在");
        }

        try {
            String progressJson = objectMapper.writeValueAsString(progressNodes);
            record.setProgressNodes(progressJson);
            record.setUpdateBy(UserContext.username());
            LocalDateTime now = LocalDateTime.now();
            record.setUpdateTime(now);

            boolean allCompleted = progressNodes.values().stream().allMatch(v -> v >= 100);
            if (allCompleted && !"PRODUCTION_COMPLETED".equals(record.getStatus()) && !"COMPLETED".equals(record.getStatus()) && !"WAREHOUSE_OUT".equals(record.getStatus())) {
                statusHelper.markPatternProductionCompleted(record, now);
            }

            patternProductionService.updateById(record);
            statusHelper.syncStyleInfoSampleStage(record);
            log.info("Pattern production progress updated: id={}, progress={}", id, progressNodes);
            return "进度更新成功";
        } catch (Exception e) {
            log.error("Failed to update progress: id={}", id, e);
            throw new RuntimeException("更新失败：" + e.getMessage(), e);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> completeByTask(String patternId) {
        if (!StringUtils.hasText(patternId)) {
            throw new IllegalArgumentException("样板生产ID不能为空");
        }
        PatternProduction pattern = getPatternWithTenant(patternId);
        if (pattern == null || pattern.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("样板生产记录不存在");
        }
        if (!"IN_PROGRESS".equals(pattern.getStatus()) && !"REWORK".equals(pattern.getStatus())) {
            throw new IllegalStateException("当前状态不允许完成，仅制作中或返修中可操作");
        }
        String currentUserId = UserContext.userId();
        if (pattern.getReceiverId() != null && !pattern.getReceiverId().equals(currentUserId)) {
            throw new IllegalStateException("仅领取人可点击完成");
        }

        LocalDateTime now = LocalDateTime.now();
        String operatorName = UserContext.username();

        boolean wasRework = "REWORK".equals(pattern.getStatus());

        PatternScanRecord scanRecord = new PatternScanRecord();
        scanRecord.setPatternProductionId(patternId);
        scanRecord.setStyleId(pattern.getStyleId());
        scanRecord.setStyleNo(pattern.getStyleNo());
        scanRecord.setColor(pattern.getColor());
        String opType = wasRework ? "REWORK" : "COMPLETE";
        scanRecord.setOperationType(opType);
        scanRecord.setProcessName(patternOperationLabel(opType));
        scanRecord.setProgressStage(mapOperationTypeToProgressStage(opType));
        scanRecord.setProcessCode(opType);
        scanRecord.setOperatorId(currentUserId);
        scanRecord.setOperatorName(operatorName);
        scanRecord.setOperatorRole("PLATE_WORKER");
        scanRecord.setScanTime(now);
        scanRecord.setRemark(wasRework ? "返修完成" : "制作完成");
        patternScanRecordService.save(scanRecord);

        statusHelper.markPatternProductionCompleted(pattern, now);

        if (wasRework) {
            pattern.setReviewStatus("PENDING");
            pattern.setReworkCount(pattern.getReworkCount() != null ? pattern.getReworkCount() + 1 : 1);
        }
        patternProductionService.updateById(pattern);

        statusHelper.syncStyleInfoSampleStage(pattern);

        createPatternScanRecordForWage(pattern, wasRework ? "返修完成" : "制作完成", currentUserId, operatorName, now);

        log.info("[样衣完成] patternId={} operator={} type={}", patternId, operatorName, scanRecord.getOperationType());

        Map<String, Object> result = new HashMap<>();
        result.put("recordId", scanRecord.getId());
        result.put("patternId", patternId);
        result.put("styleNo", pattern.getStyleNo());
        result.put("color", pattern.getColor());
        result.put("operationType", scanRecord.getOperationType());
        result.put("newStatus", "PRODUCTION_COMPLETED");
        return result;
    }

    /**
     * 提交样板生产扫码记录（跨域：创建扫码记录 + 更新样板状态）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> submitScan(String patternId, String operationType, String operatorRole, String remark,
                                          Integer quantity, String color, String size,
                                          String warehouseCode, String warehouseAreaId,
                                          String warehouseLocationCode, BigDecimal unitPrice,
                                          String processName, String progressStage) {
        assertSubmitScanParams(patternId, operationType);
        PatternProduction pattern = loadPatternForScan(patternId);
        statusHelper.validateWarehouseOperationFlow(patternId, operationType);

        String operatorId = UserContext.userId();
        String operatorName = UserContext.username();
        updatePatternQuantityIfNeeded(pattern, quantity, operatorName);

        // 优先使用前端传入的颜色/尺码，为空时 fallback 到样板单的值
        String effectiveColor = StringUtils.hasText(color) ? color : pattern.getColor();
        String effectiveSize = StringUtils.hasText(size) ? size : pattern.getSize();

        PatternScanRecord scanRecord = createPatternScanRecord(pattern, operationType, operatorId, operatorName,
                operatorRole, remark, quantity, effectiveColor, effectiveSize,
                warehouseCode, warehouseAreaId, warehouseLocationCode, processName, progressStage, unitPrice);
        patternScanRecordService.save(scanRecord);

        // 自动追加操作日志到 PatternProduction.remarks（与大货 ProductionOrder.remarks 一致）
        appendPatternRemark(pattern, operationType, operatorName, scanRecord, unitPrice);

        syncToScanRecord(pattern, operationType, operatorId, operatorName, remark, unitPrice, effectiveColor, effectiveSize);
        statusHelper.updatePatternStatusByOperation(pattern, operationType, operatorName);

        if ("COMPLETE".equals(operationType.trim()) || "WAREHOUSE_IN".equals(operationType.trim())) {
            statusHelper.syncStyleInfoSampleStage(pattern);
        }

        stockHelper.syncStockByOperation(pattern, scanRecord, operationType, operatorId, operatorName);
        statusHelper.syncStyleInfoOnScan(pattern.getStyleId(), operatorName, operationType);

        return buildSubmitScanResult(scanRecord, patternId, pattern, operationType, operatorName, warehouseCode);
    }

    private void assertSubmitScanParams(String patternId, String operationType) {
        if (!StringUtils.hasText(patternId)) throw new IllegalArgumentException("样板生产ID不能为空");
        if (!StringUtils.hasText(operationType)) throw new IllegalArgumentException("操作类型不能为空");
    }

    private PatternProduction loadPatternForScan(String patternId) {
        PatternProduction pattern = getPatternWithTenant(patternId);
        if (pattern == null || pattern.getDeleteFlag() == 1) throw new IllegalArgumentException("样板生产记录不存在");
        return pattern;
    }

    private void updatePatternQuantityIfNeeded(PatternProduction pattern, Integer quantity, String operatorName) {
        if (quantity != null && quantity > 0 && (pattern.getQuantity() == null || pattern.getQuantity() <= 0)) {
            pattern.setQuantity(quantity);
            pattern.setUpdateBy(operatorName);
            pattern.setUpdateTime(LocalDateTime.now());
            patternProductionService.updateById(pattern);
        }
    }

    private PatternScanRecord createPatternScanRecord(PatternProduction pattern, String operationType,
            String operatorId, String operatorName, String operatorRole, String remark, Integer quantity,
            String effectiveColor, String effectiveSize,
            String warehouseCode, String warehouseAreaId, String warehouseLocationCode,
            String processName, String progressStage, BigDecimal unitPrice) {
        PatternScanRecord scanRecord = new PatternScanRecord();
        scanRecord.setPatternProductionId(pattern.getId());
        scanRecord.setStyleId(pattern.getStyleId());
        scanRecord.setStyleNo(pattern.getStyleNo());
        scanRecord.setColor(effectiveColor);
        scanRecord.setSize(effectiveSize);
        // 数量：优先使用本次扫码传入的数量，其次取样板生产单的数量
        int effectiveQty = 1;
        if (quantity != null && quantity > 0) {
            effectiveQty = quantity;
            scanRecord.setQuantity(quantity);
        } else if (pattern.getQuantity() != null && pattern.getQuantity() > 0) {
            effectiveQty = pattern.getQuantity();
            scanRecord.setQuantity(pattern.getQuantity());
        } else {
            scanRecord.setQuantity(effectiveQty);
        }
        scanRecord.setOperationType(operationType);
        // 工序名/阶段：优先使用前端工序系统传入的动态值，为空时按 operationType 映射
        scanRecord.setProcessName(StringUtils.hasText(processName) ? processName : patternOperationLabel(operationType));
        scanRecord.setProgressStage(StringUtils.hasText(progressStage) ? progressStage : mapOperationTypeToProgressStage(operationType));
        scanRecord.setProcessCode(operationType);
        scanRecord.setOperatorId(operatorId);
        scanRecord.setOperatorName(operatorName);
        scanRecord.setOperatorRole(operatorRole);
        scanRecord.setScanTime(LocalDateTime.now());
        scanRecord.setWarehouseCode(StringUtils.hasText(warehouseCode) ? warehouseCode.trim() : null);
        scanRecord.setWarehouseAreaId(StringUtils.hasText(warehouseAreaId) ? warehouseAreaId.trim() : null);
        scanRecord.setWarehouseLocationCode(StringUtils.hasText(warehouseLocationCode) ? warehouseLocationCode.trim() : null);
        scanRecord.setRemark(remark);
        // 保存单价和扫码成本（支持按样衣单价结算工资）
        if (unitPrice != null && unitPrice.compareTo(BigDecimal.ZERO) > 0) {
            scanRecord.setUnitPrice(unitPrice);
            scanRecord.setScanCost(unitPrice.multiply(BigDecimal.valueOf(effectiveQty)));
        }
        scanRecord.setCreateTime(LocalDateTime.now());
        scanRecord.setDeleteFlag(0);
        return scanRecord;
    }

    private void syncToScanRecord(PatternProduction pattern, String operationType,
            String operatorId, String operatorName, String remark, BigDecimal unitPrice,
            String effectiveColor, String effectiveSize) {
        try {
            ScanRecord sr = new ScanRecord();
            sr.setScanType("pattern");
            sr.setScanResult("success");
            sr.setOperatorId(operatorId);
            sr.setOperatorName(operatorName);
            sr.setScanTime(LocalDateTime.now());
            sr.setStyleNo(pattern.getStyleNo());
            sr.setOrderNo(pattern.getStyleNo());
            sr.setColor(effectiveColor);
            sr.setSize(effectiveSize);
            String processLabel = patternOperationLabel(operationType);
            sr.setProcessName(processLabel);
            sr.setProcessCode(processLabel);
            sr.setProgressStage(processLabel);
            int patternQty = (pattern.getQuantity() != null && pattern.getQuantity() > 0) ? pattern.getQuantity() : 1;
            sr.setQuantity(patternQty);
            if (unitPrice != null && unitPrice.compareTo(BigDecimal.ZERO) > 0) {
                sr.setProcessUnitPrice(unitPrice);
                sr.setScanCost(unitPrice.multiply(BigDecimal.valueOf(patternQty)));
            }
            sr.setTenantId(UserContext.tenantId());
            sr.setFactoryId(null);
            // 样衣没有菲号概念，保留 null（cuttingBundleNo 字段为 Integer 类型）
            sr.setCuttingBundleNo(null);
            sr.setRemark(remark);
            sr.setCreateTime(LocalDateTime.now());
            scanRecordService.saveScanRecord(sr);
        } catch (Exception e) {
            log.warn("样衣扫码同步写入ScanRecord失败，不影响主流程", e);
        }
    }

    private Map<String, Object> buildSubmitScanResult(PatternScanRecord scanRecord, String patternId,
            PatternProduction pattern, String operationType, String operatorName, String warehouseCode) {
        Map<String, Object> result = new HashMap<>();
        result.put("recordId", scanRecord.getId());
        result.put("patternId", patternId);
        result.put("styleNo", pattern.getStyleNo());
        result.put("color", pattern.getColor());
        result.put("operationType", operationType);
        result.put("operatorName", operatorName);
        result.put("quantity", pattern.getQuantity());
        result.put("warehouseCode", warehouseCode);
        result.put("scanTime", scanRecord.getScanTime());
        result.put("newStatus", pattern.getStatus());
        return result;
    }

    /**
     * 自动追加操作日志到 PatternProduction.remarks
     * 格式与大货一致：[yyyy-MM-dd HH:mm:ss] 操作人 动作：详情
     */
    private void appendPatternRemark(PatternProduction pattern, String operationType, String operatorName,
                                     PatternScanRecord scanRecord, BigDecimal unitPrice) {
        try {
            String actionLabel = patternOperationLabel(operationType);
            StringBuilder detail = new StringBuilder();
            detail.append(scanRecord.getProcessName() != null ? scanRecord.getProcessName() : actionLabel);
            if (scanRecord.getQuantity() != null && scanRecord.getQuantity() > 0) {
                detail.append(" · 数量").append(scanRecord.getQuantity());
            }
            if (scanRecord.getColor() != null && !scanRecord.getColor().isEmpty()) {
                detail.append(" · ").append(scanRecord.getColor());
            }
            if (scanRecord.getSize() != null && !scanRecord.getSize().isEmpty()) {
                detail.append("/").append(scanRecord.getSize());
            }
            if (unitPrice != null && unitPrice.compareTo(BigDecimal.ZERO) > 0) {
                detail.append(" · 单价¥").append(unitPrice.toPlainString());
            }

            String now = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                    .format(java.time.LocalDateTime.now());
            String newEntry = "[" + now + "] " + (operatorName != null ? operatorName : "-") + " " + actionLabel + "：" + detail;

            // 重新查询最新数据再追加（避免覆盖并发写入）
            PatternProduction fresh = patternProductionService.getById(pattern.getId());
            if (fresh == null) return;
            String existing = fresh.getRemarks();
            String merged;
            if (existing == null || existing.trim().isEmpty()) {
                merged = newEntry;
            } else {
                merged = existing + "\n" + newEntry;
            }
            // 限制最大长度 4000 字符，保留最近 20 条
            if (merged.length() > 4000) {
                String[] lines = merged.split("\n");
                int keep = Math.min(lines.length, 20);
                StringBuilder sb = new StringBuilder();
                for (int i = lines.length - keep; i < lines.length; i++) {
                    if (sb.length() > 0) sb.append("\n");
                    sb.append(lines[i]);
                }
                merged = sb.toString();
            }
            fresh.setRemarks(merged);
            patternProductionService.updateById(fresh);
            // 同步到内存对象，供后续逻辑使用
            pattern.setRemarks(merged);

            // === 双写 t_order_remark 表 ===
            // 与 OrderRemarkHelper.append 双写策略一致，让 PC 端 RemarkTimelineModal
            // 和小程序「备注日志」tab 都能拉取展示
            try {
                if (orderRemarkService != null) {
                    com.fashion.supplychain.system.entity.OrderRemark record =
                            new com.fashion.supplychain.system.entity.OrderRemark();
                    record.setTargetType("pattern");
                    record.setTargetNo(String.valueOf(fresh.getId()));
                    record.setAuthorName(operatorName != null ? operatorName : "-");
                    record.setAuthorRole(actionLabel);
                    record.setContent(newEntry);
                    record.setTenantId(fresh.getTenantId());
                    record.setCreateTime(LocalDateTime.now());
                    record.setDeleteFlag(0);
                    orderRemarkService.save(record);
                }
            } catch (Exception e) {
                log.warn("样衣扫码同步t_order_remark失败，不影响主流程: patternId={}, error={}",
                        pattern.getId(), e.getMessage());
            }
        } catch (Exception e) {
            log.warn("样衣扫码追加操作日志失败，不影响主流程: patternId={}, error={}", pattern.getId(), e.getMessage());
        }
    }

    /**
     * 样衣入库（跨域：扫码 + 状态更新）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> warehouseIn(String patternId, String remark, String warehouseCode,
            String warehouseAreaId, String warehouseLocationCode) {
        PatternProduction pattern = getPatternWithTenant(patternId);
        if (pattern == null || pattern.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("样板生产记录不存在");
        }
        String status = StringUtils.hasText(pattern.getStatus()) ? pattern.getStatus().trim().toUpperCase() : "";
        if (!"PRODUCTION_COMPLETED".equals(status) && !"COMPLETED".equals(status) && !"WAREHOUSE_OUT".equals(status)) {
            throw new IllegalStateException("样板生产未完成，无法入库");
        }
        if (!statusHelper.isReviewApproved(pattern)) {
            throw new IllegalStateException("样衣审核未通过，无法入库");
        }

        Map<String, Object> result = submitScan(patternId, "WAREHOUSE_IN", "WAREHOUSE", remark,
                pattern.getQuantity(), pattern.getColor(), pattern.getSize(),
                warehouseCode, warehouseAreaId, warehouseLocationCode, null, null, null);
        result.put("message", "样衣入库成功");
        return result;
    }

    /**
     * 样衣审核（入库前必经）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> reviewPattern(String patternId, String result, String remark) {
        PatternProduction pattern = getPatternWithTenant(patternId);
        if (pattern == null || pattern.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("样板生产记录不存在");
        }
        String status = StringUtils.hasText(pattern.getStatus()) ? pattern.getStatus().trim().toUpperCase() : "";
        if (!"PRODUCTION_COMPLETED".equals(status) && !"COMPLETED".equals(status) && !"WAREHOUSE_OUT".equals(status)) {
            throw new IllegalStateException("样板生产未完成，不能审核");
        }

        String normalizedResult = StringUtils.hasText(result) ? result.trim().toUpperCase() : "";
        if ("PASS".equals(normalizedResult)) { normalizedResult = "APPROVED"; }
        if ("REWORK".equals(normalizedResult) || "REJECT".equals(normalizedResult) || "APPROVED".equals(normalizedResult)) {
            // valid
        } else if (!"REJECTED".equals(normalizedResult)) {
            throw new IllegalArgumentException("审核结论无效，仅支持 PASS/REWORK/REJECT");
        }
        String normalizedRemark = StringUtils.hasText(remark) ? remark.trim() : "";

        String operatorName = UserContext.username();
        String operatorId = UserContext.userId();
        pattern.setReviewStatus(normalizedResult);
        pattern.setReviewResult(normalizedResult);
        pattern.setReviewRemark(normalizedRemark);
        pattern.setReviewBy(operatorName);
        pattern.setReviewById(operatorId);
        pattern.setReviewTime(LocalDateTime.now());
        pattern.setUpdateBy(operatorName);
        pattern.setUpdateTime(LocalDateTime.now());

        if ("REWORK".equals(normalizedResult)) {
            pattern.setStatus("REWORK");
        }

        patternProductionService.updateById(pattern);
        statusHelper.syncStyleInfoReviewFields(pattern, normalizedResult, normalizedRemark, operatorName);

        String msg;
        if ("APPROVED".equals(normalizedResult)) { msg = "样衣审核通过"; }
        else if ("REWORK".equals(normalizedResult)) { msg = "样衣审核返修，请扫码返修"; }
        else { msg = "样衣审核已驳回"; }

        Map<String, Object> response = new HashMap<>();
        response.put("patternId", pattern.getId());
        response.put("reviewStatus", pattern.getReviewStatus());
        response.put("reviewResult", pattern.getReviewResult());
        response.put("reviewRemark", pattern.getReviewRemark());
        response.put("reviewBy", pattern.getReviewBy());
        response.put("reviewById", pattern.getReviewById());
        response.put("reviewTime", pattern.getReviewTime());
        response.put("newStatus", pattern.getStatus());
        response.put("message", msg);
        return response;
    }

    /**
     * 获取样衣动态工序配置（对齐大货动态工序思路）
     */
    public List<Map<String, Object>> getPatternProcessConfig(String patternId) {
        return enrichmentHelper.getPatternProcessConfig(patternId);
    }

    /**
     * 维护操作
     */
    public void maintenance(String id, String reason) {
        PatternProduction pattern = getPatternWithTenant(id);
        if (pattern == null || pattern.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("样板生产记录不存在");
        }

        String currentUsername = UserContext.username();
        pattern.setMaintainer(currentUsername);
        pattern.setMaintainTime(LocalDateTime.now());
        patternProductionService.updateById(pattern);

        log.info("样板生产维护成功: id={}, maintainer={}, reason={}", id, currentUsername, reason);
    }

    // ========================== 私有辅助方法 ==========================

    private void parseAndSetTime(Map<String, Object> params, String key, PatternProduction record) {
        if (params.containsKey(key)) {
            try {
                String timeStr = (String) params.get(key);
                if (StringUtils.hasText(timeStr)) {
                    LocalDateTime time = LocalDateTime.parse(timeStr.replace(" ", "T"));
                    if ("releaseTime".equals(key)) {
                        record.setReleaseTime(time);
                    } else if ("deliveryTime".equals(key)) {
                        record.setDeliveryTime(time);
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to parse {}: {}", key, params.get(key));
            }
        }
    }

    private String patternOperationLabel(String operationType) {
        if (operationType == null) return "样衣操作";
        switch (operationType) {
            case "RECEIVE":          return "领取样板";
            case "PLATE":            return "车板扫码";
            case "FOLLOW_UP":        return "跟单确认";
            case "COMPLETE":         return "完成确认";
            case "REWORK":           return "返修完成";
            case "WAREHOUSE_IN":     return "样衣入库";
            case "WAREHOUSE_OUT":    return "样衣出库";
            case "WAREHOUSE_RETURN": return "样衣归还";
            default:                 return "样衣操作";
        }
    }

    /** 将 operationType 映射为标准 progressStage（中文），与前端工序配置对齐 */
    private String mapOperationTypeToProgressStage(String operationType) {
        if (operationType == null) return null;
        switch (operationType.trim().toUpperCase()) {
            case "RECEIVE":
            case "PROCUREMENT":      return "采购";
            case "CUTTING":          return "裁剪";
            case "SECONDARY":        return "二次工艺";
            case "SEWING":           return "车缝";
            case "TAIL":             return "尾部";
            case "WAREHOUSE_IN":     return "入库";
            case "WAREHOUSE_OUT":    return "出库";
            case "WAREHOUSE_RETURN": return "归还";
            case "IRONING":          return "整烫";
            case "QUALITY":          return "质检";
            case "PACKAGING":        return "包装";
            case "PLATE":            return "车板";
            case "FOLLOW_UP":        return "跟单确认";
            case "COMPLETE":         return "完成确认";
            case "REWORK":           return "返修";
            default:                 return operationType;
        }
    }

    private void createPatternScanRecordForWage(PatternProduction pattern, String processLabel,
                                                  String operatorId, String operatorName, LocalDateTime scanTime) {
        try {
            ScanRecord sr = new ScanRecord();
            sr.setScanType("pattern");
            sr.setScanResult("success");
            sr.setOperatorId(operatorId);
            sr.setOperatorName(operatorName);
            sr.setScanTime(scanTime);
            sr.setStyleNo(pattern.getStyleNo());
            sr.setOrderNo(pattern.getStyleNo());
            sr.setColor(pattern.getColor());
            sr.setProcessName(processLabel);
            sr.setProcessCode(processLabel);
            sr.setProgressStage(processLabel);
            int qty = (pattern.getQuantity() != null && pattern.getQuantity() > 0) ? pattern.getQuantity() : 1;
            sr.setQuantity(qty);
            sr.setTenantId(UserContext.tenantId());
            sr.setFactoryId(null);
            sr.setCuttingBundleNo(null);
            sr.setCreateTime(LocalDateTime.now());
            scanRecordService.saveScanRecord(sr);
            try {
                com.fashion.supplychain.style.entity.StyleProcess sp = styleProcessService.lambdaQuery()
                        .eq(com.fashion.supplychain.style.entity.StyleProcess::getStyleId, pattern.getStyleId())
                        .eq(com.fashion.supplychain.style.entity.StyleProcess::getProcessName, processLabel)
                        .last("LIMIT 1")
                        .one();
                if (sp != null && sp.getPrice() != null && sp.getPrice().compareTo(java.math.BigDecimal.ZERO) > 0) {
                    sr.setProcessUnitPrice(sp.getPrice());
                    sr.setScanCost(sp.getPrice().multiply(java.math.BigDecimal.valueOf(qty)));
                    scanRecordService.updateById(sr);
                }
            } catch (Exception ex) {
                log.debug("样衣ScanRecord工序单价查询失败，不影响主流程: {}", ex.getMessage());
            }
        } catch (Exception e) {
            log.warn("样衣操作同步写入ScanRecord失败，不影响主流程: {}", e.getMessage());
        }
    }

    /**
     * 撤销样衣扫码记录（管理员/主管权限）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> undoPatternScan(String scanRecordId) {
        if (!StringUtils.hasText(scanRecordId)) {
            throw new IllegalArgumentException("扫码记录ID不能为空");
        }

        PatternScanRecord scanRecord = patternScanRecordService.getById(scanRecordId);
        if (scanRecord == null || scanRecord.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("扫码记录不存在");
        }

        String operatorName = UserContext.username();

        LocalDateTime scanTime = scanRecord.getScanTime();
        if (scanTime != null && scanTime.plusMinutes(30).isBefore(LocalDateTime.now())) {
            throw new IllegalStateException("只能撤回30分钟内的扫码记录");
        }

        String patternProductionId = scanRecord.getPatternProductionId();
        if (!StringUtils.hasText(patternProductionId)) {
            throw new IllegalArgumentException("扫码记录缺少样板生产ID");
        }

        PatternProduction pattern = patternProductionService.getById(patternProductionId);
        if (pattern == null || pattern.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("关联的样板生产记录不存在");
        }

        scanRecord.setDeleteFlag(1);
        patternScanRecordService.updateById(scanRecord);

        log.info("[样衣撤回] scanRecordId={} operationType={} operatorName={} undoBy={}",
                scanRecordId, scanRecord.getOperationType(), scanRecord.getOperatorName(), operatorName);

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "已撤销扫码记录");
        result.put("scanRecordId", scanRecordId);
        result.put("undoBy", operatorName);
        return result;
    }

    /**
     * 指派样板生产给指定人员
     */
    public void assignPattern(String patternId, String assignee) {
        if (!StringUtils.hasText(patternId)) {
            throw new IllegalArgumentException("样板生产ID不能为空");
        }
        if (!StringUtils.hasText(assignee)) {
            throw new IllegalArgumentException("指派人员不能为空");
        }

        PatternProduction pattern = getPatternWithTenant(patternId);
        String currentStatus = StringUtils.hasText(pattern.getStatus()) ? pattern.getStatus().trim().toUpperCase() : "";

        pattern.setReceiver(assignee);
        pattern.setPatternMaker(assignee);
        pattern.setUpdateBy(UserContext.username());
        pattern.setUpdateTime(LocalDateTime.now());

        if ("PENDING".equals(currentStatus)) {
            pattern.setStatus("IN_PROGRESS");
            pattern.setReceiveTime(LocalDateTime.now());
            log.info("[样衣指派] 自动领取: patternId={} assignee={}", patternId, assignee);
        }

        patternProductionService.updateById(pattern);

        log.info("[样衣指派] patternId={} assignee={} oldStatus={} newStatus={}",
                patternId, assignee, currentStatus, pattern.getStatus());
    }

    /**
     * 更新是否有二次工艺标志
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateSecondaryFlag(String id, int hasSecondaryProcess) {
        PatternProduction record = patternProductionService.getById(id);
        if (record == null) {
            throw new IllegalArgumentException("记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(record.getTenantId(), "纸样");
        record.setHasSecondaryProcess(hasSecondaryProcess);
        record.setUpdateTime(LocalDateTime.now());
        record.setUpdateBy(UserContext.username());
        patternProductionService.updateById(record);
    }

    /**
     * 删除样板（软删除）
     */
    @Transactional(rollbackFor = Exception.class)
    public void delete(String id) {
        PatternProduction record = patternProductionService.getById(id);
        if (record == null) {
            throw new IllegalArgumentException("记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(record.getTenantId(), "纸样");
        patternProductionService.removeById(id);
        log.info("Pattern production deleted: id={}", id);
    }

    /**
     * 更新样板基本信息（款号/颜色/尺码）
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateBasicInfo(String id, String field, String value) {
        if (!StringUtils.hasText(field) || value == null) {
            throw new IllegalArgumentException("field 和 value 不能为空");
        }
        if (!java.util.List.of("styleNo", "color", "size").contains(field)) {
            throw new IllegalArgumentException("不支持的编辑字段: " + field + "，仅支持 styleNo / color / size");
        }

        PatternProduction record = patternProductionService.getById(id);
        if (record == null || record.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(record.getTenantId(), "纸样");

        long scanCount = patternScanRecordService.count(
                new LambdaQueryWrapper<PatternScanRecord>()
                        .eq(PatternScanRecord::getPatternProductionId, id)
                        .eq(PatternScanRecord::getDeleteFlag, 0)
                        .eq(PatternScanRecord::getTenantId, UserContext.tenantId()));
        if (scanCount > 0) {
            throw new IllegalStateException("已有扫码记录，不可编辑基本字段");
        }

        switch (field) {
            case "styleNo":
                record.setStyleNo(value.trim());
                break;
            case "color":
                record.setColor(value.trim());
                break;
            case "size":
                record.setSize(value.trim());
                break;
        }
        record.setUpdateTime(LocalDateTime.now());
        record.setUpdateBy(UserContext.username());
        patternProductionService.updateById(record);
        log.info("样板基本信息已更新: id={} field={} value={}", id, field, value);
    }

    private PatternProduction getPatternWithTenant(String id) {
        return patternProductionService.lambdaQuery()
                .eq(PatternProduction::getId, Long.valueOf(id))
                .eq(PatternProduction::getTenantId, com.fashion.supplychain.common.UserContext.tenantId())
                .eq(PatternProduction::getDeleteFlag, 0)
                .one();
    }
}
