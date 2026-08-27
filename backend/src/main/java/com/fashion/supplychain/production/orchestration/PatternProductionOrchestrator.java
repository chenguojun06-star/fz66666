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
import com.fashion.supplychain.intelligence.helper.StatusTranslator;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
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
     * <p>
     * 排除规则与 {@link #calcSampleStats()} 保持一致：
     * 1. 已完成：patternStatus/sampleStatus = COMPLETED/WAREHOUSE_IN 或 progressNode = 样衣完成
     * 2. 已排除：styleStatus = archived/scrapped 或 progressNode = 开发样报废 或 sampleReviewStatus = PASS/APPROVED
     * <p>
     * P0 修复（stats/list 一致性）：旧版仅排除 COMPLETED/WAREHOUSE_IN/SCRAPPED，
     * 会将已归档/审核通过的订单计入延期/临近交期，导致 stats 与 list 计数不一致
     */
    private List<Map<String, Object>> filterByDueDate(List<Map<String, Object>> records, String status) {
        java.time.LocalDate today = java.time.LocalDate.now();
        return records.stream().filter(m -> {
            String recordStatus = String.valueOf(m.get("status") == null ? "" : m.get("status")).trim().toUpperCase();
            // 已完成（与 calcSampleStats.isCompleted 一致）
            if ("COMPLETED".equals(recordStatus) || "WAREHOUSE_IN".equals(recordStatus)) {
                return false;
            }
            // 从 styleInfo 获取复合状态（与 calcSampleStats 一致）
            String styleStatus = "";
            String progressNode = "";
            String sampleStatus = "";
            String sampleReviewStatus = "";
            Object styleInfoObj = m.get("styleInfo");
            if (styleInfoObj instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> styleInfo = (Map<String, Object>) styleInfoObj;
                styleStatus = String.valueOf(styleInfo.getOrDefault("status", "")).trim().toLowerCase();
                progressNode = String.valueOf(styleInfo.getOrDefault("progressNode", "")).trim();
                sampleStatus = String.valueOf(styleInfo.getOrDefault("sampleStatus", "")).trim().toUpperCase();
                sampleReviewStatus = String.valueOf(styleInfo.getOrDefault("sampleReviewStatus", "")).trim().toUpperCase();
                if ("COMPLETED".equals(sampleStatus) || "WAREHOUSE_IN".equals(sampleStatus)
                        || "样衣完成".equals(progressNode)) {
                    return false;
                }
            }
            // 已排除（与 calcSampleStats.isExcluded 一致）
            if ("archived".equals(styleStatus) || "scrapped".equals(styleStatus)
                    || "开发样报废".equals(progressNode)
                    || "PASS".equals(sampleReviewStatus) || "APPROVED".equals(sampleReviewStatus)) {
                return false;
            }
            // 已报废（保留旧逻辑，与 SCRAPPED 等价）
            if ("SCRAPPED".equals(recordStatus)) {
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
        // 显式带 tenant_id 过滤（防御性编程，符合 P0 铁律 4：多租户隔离）
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<PatternProduction> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternProduction::getTenantId, tenantId)
                .eq(PatternProduction::getDeleteFlag, 0);
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
     * 更新工序进度（跨域更新：PatternProduction + StyleInfo）
     *
     * 注：旧的 receivePattern（领取样板）方法已删除 — 现在统一走工序级扫码流程：
     * 工人扫二维码 → submitScan(operationType=RECEIVE, processName=...) 触发领取
     * 由 PatternStatusHelper.ensureInProgress 在首次扫码时自动补全 receiver/receiveTime
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

            // 备注日志：更新进度
            StringBuilder progressDetail = new StringBuilder();
            progressDetail.append("进度节点：").append(progressNodes.size()).append(" 项");
            if (allCompleted) {
                progressDetail.append(" · 全部完成");
            }
            appendPatternRemarkSimple(record, "更新进度", progressDetail.toString());

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
        // 权限校验：扫码完成人优先；receiverId 不存在时回退到扫码记录最近一次 PLATE/FOLLOW_UP 的操作人
        // （旧的「领取样板」端点已删除，receiverId 不再可靠；改为以扫码记录为权威）
        if (StringUtils.hasText(pattern.getReceiverId()) && !pattern.getReceiverId().equals(currentUserId)) {
            // receiverId 与当前用户不一致：可能是后来的扫码工人，再查最近一次制作类扫码记录的 operatorId
            PatternScanRecord latest = patternScanRecordService.lambdaQuery()
                    .eq(PatternScanRecord::getPatternProductionId, patternId)
                    .eq(PatternScanRecord::getTenantId, UserContext.tenantId())
                    .eq(PatternScanRecord::getDeleteFlag, 0)
                    .in(PatternScanRecord::getOperationType, java.util.Arrays.asList("PLATE", "FOLLOW_UP", "REWORK", "COMPLETE"))
                    .orderByDesc(PatternScanRecord::getScanTime)
                    .last("LIMIT 1")
                    .one();
            if (latest != null && StringUtils.hasText(latest.getOperatorId())
                    && !latest.getOperatorId().equals(currentUserId)) {
                throw new IllegalStateException("仅最近一次制作类扫码操作人或领取人可点击完成");
            }
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

        // 备注日志：制作完成/返修完成
        String completeAction = wasRework ? "返修完成" : "制作完成";
        StringBuilder completeDetail = new StringBuilder();
        completeDetail.append("操作人：").append(operatorName);
        if (pattern.getQuantity() != null && pattern.getQuantity() > 0) {
            completeDetail.append(" · 数量").append(pattern.getQuantity());
        }
        if (wasRework) {
            int reworkCount = pattern.getReworkCount() != null ? pattern.getReworkCount() : 0;
            completeDetail.append(" · 第").append(reworkCount).append("次返修");
        }
        appendPatternRemarkSimple(pattern, completeAction, completeDetail.toString());

        log.info("[样衣完成] patternId={} operator={} type={}", patternId, operatorName, scanRecord.getOperationType());

        Map<String, Object> result = new HashMap<>();
        result.put("recordId", scanRecord.getId());
        result.put("patternId", patternId);
        result.put("styleNo", pattern.getStyleNo());
        result.put("color", pattern.getColor());
        result.put("operationType", scanRecord.getOperationType());
        result.put("newStatus", "PRODUCTION_COMPLETED");
        result.put("newStatusLabel", StatusTranslator.translateStatus("PRODUCTION_COMPLETED"));
        return result;
    }

    /**
     * D-167：软删 2026-07-01 前的旧四步流程历史测试扫码记录（CLAIM 模型上线前的遗留垃圾）
     * 幂等：可重复调用；仅软删（delete_flag=1），不触碰工资镜像与样板状态
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> cleanupLegacyScanRecords() {
        java.time.LocalDateTime cutoff = java.time.LocalDateTime.of(2026, 7, 1, 0, 0, 0);
        List<PatternScanRecord> legacy = patternScanRecordService.lambdaQuery()
                .lt(PatternScanRecord::getScanTime, cutoff)
                .eq(PatternScanRecord::getDeleteFlag, 0)
                .list();
        int removed = 0;
        if (legacy != null) {
            for (PatternScanRecord r : legacy) {
                r.setDeleteFlag(1);
                removed += patternScanRecordService.updateById(r) ? 1 : 0;
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("removed", removed);
        result.put("cutoff", cutoff.toString());
        return result;
    }

    /**
     * D-174：修正样衣扫码计件工资镜像的历史脏数据（幂等，dryRun=true 只读预览）
     * <p>
     * 修正规则（仅针对 scan_type='pattern' 且未结算的记录，已结算记录不动以防破坏结算单）：
     * 1. 数量虚增：D-172 之前报工镜像记录的是样板计划数量（如12件），样衣按件统计统一修正为 1 件
     * 2. 单价回填：unit_price 为 0/NULL 时，按 款号→款式ID→工序配置价(t_style_process.price) 回填；
     *    查不到配置价保持 0（领取/入库等流程动作本就无单价）
     * 3. 金额对齐：total_amount/scan_cost 统一重算为 单价×数量
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> fixPatternScanWageData(boolean dryRun) {
        Long tenantId = TenantAssert.requireTenantId();
        List<ScanRecord> records = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getTenantId, tenantId)
                .eq(ScanRecord::getScanType, "pattern")
                .eq(ScanRecord::getScanResult, "success")
                .and(w -> w.isNull(ScanRecord::getSettlementStatus)
                        .or().notIn(ScanRecord::getSettlementStatus, "settled", "payroll_settled", "payroll_approved"))
                .list();

        List<Map<String, Object>> items = new ArrayList<>();
        int fixedQty = 0;
        int fixedPrice = 0;
        int fixedAmount = 0;
        if (records != null) {
            for (ScanRecord sr : records) {
                boolean changed = false;
                // 修正前快照（预览/审计用）
                Integer oldQuantity = sr.getQuantity();
                BigDecimal oldUnitPrice = sr.getUnitPrice();
                BigDecimal oldTotalAmount = sr.getTotalAmount();
                // 规则1：数量虚增修正（D-172 前镜像记录的是计划数量）
                if (sr.getQuantity() != null && sr.getQuantity() > 1) {
                    sr.setQuantity(1);
                    fixedQty++;
                    changed = true;
                }
                // 规则2：单价回填（按款号反查款式工序配置价）
                if (sr.getUnitPrice() == null || sr.getUnitPrice().compareTo(BigDecimal.ZERO) <= 0) {
                    BigDecimal configured = lookupPriceByStyleNo(sr.getStyleNo(), sr.getProcessName());
                    if (configured != null && configured.compareTo(BigDecimal.ZERO) > 0) {
                        sr.setUnitPrice(configured);
                        sr.setProcessUnitPrice(configured);
                        fixedPrice++;
                        changed = true;
                    }
                } else if (sr.getProcessUnitPrice() == null
                        || sr.getProcessUnitPrice().compareTo(BigDecimal.ZERO) <= 0) {
                    sr.setProcessUnitPrice(sr.getUnitPrice());
                    changed = true;
                }
                // 规则3：金额对齐（单价×数量）
                BigDecimal price = sr.getUnitPrice() == null ? BigDecimal.ZERO : sr.getUnitPrice();
                int qty = sr.getQuantity() == null ? 0 : sr.getQuantity();
                BigDecimal expected = price.multiply(BigDecimal.valueOf(qty));
                if (sr.getTotalAmount() == null || sr.getTotalAmount().compareTo(expected) != 0) {
                    sr.setTotalAmount(expected);
                    sr.setScanCost(expected);
                    fixedAmount++;
                    changed = true;
                }
                if (changed) {
                    Map<String, Object> item = new HashMap<>();
                    item.put("recordId", sr.getId());
                    item.put("styleNo", sr.getStyleNo());
                    item.put("processName", sr.getProcessName());
                    item.put("operatorName", sr.getOperatorName());
                    item.put("scanTime", sr.getScanTime());
                    item.put("oldQuantity", oldQuantity);
                    item.put("oldUnitPrice", oldUnitPrice);
                    item.put("oldTotalAmount", oldTotalAmount);
                    item.put("newQuantity", sr.getQuantity());
                    item.put("newUnitPrice", sr.getUnitPrice());
                    item.put("newTotalAmount", sr.getTotalAmount());
                    items.add(item);
                    if (!dryRun) {
                        scanRecordService.updateById(sr);
                    }
                }
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("dryRun", dryRun);
        result.put("totalScanned", records == null ? 0 : records.size());
        result.put("toFixCount", items.size());
        result.put("quantityFixed", fixedQty);
        result.put("priceBackfilled", fixedPrice);
        result.put("amountRecalculated", fixedAmount);
        result.put("fixItems", items);
        return result;
    }

    /**
     * D-174：按款号反查款式工序配置单价（款号→StyleInfo.id→lookupStyleProcessPrice）
     */
    private BigDecimal lookupPriceByStyleNo(String styleNo, String processName) {
        if (!StringUtils.hasText(styleNo) || !StringUtils.hasText(processName)) {
            return null;
        }
        try {
            StyleInfo style = styleInfoService.lambdaQuery()
                    .select(StyleInfo::getId)
                    .eq(StyleInfo::getStyleNo, styleNo)
                    .last("LIMIT 1")
                    .one();
            if (style == null || style.getId() == null) {
                return null;
            }
            return lookupStyleProcessPrice(String.valueOf(style.getId()), processName);
        } catch (Exception e) {
            log.warn("[D-174] 款式工序单价反查失败: styleNo={}, processName={}", styleNo, processName, e);
            return null;
        }
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

        // D-164：任务数量模式——同一操作（同操作类型+同工序）累计报工数量不能超过样板任务数量。
        // 多人分批扫码报工时，累计到达任务数量后不允许再报（撤销扫码会释放额度）
        Integer scanQty = quantity == null ? 0 : Math.max(0, quantity);
        Integer taskQty = pattern.getQuantity();
        if (scanQty > 0 && !"REVIEW".equalsIgnoreCase(operationType.trim())
                && taskQty != null && taskQty > 0) {
            String opKey = operationType.trim().toUpperCase();
            // D-164：钥匙口径=有工序名按工序名（阶段预算），无工序名按操作类型——与小程序汇总一致
            String procKey = StringUtils.hasText(processName) ? processName.trim() : opKey;
            List<PatternScanRecord> priorRecords = patternScanRecordService.lambdaQuery()
                    .eq(PatternScanRecord::getPatternProductionId, pattern.getId())
                    .eq(PatternScanRecord::getDeleteFlag, 0)
                    .list();
            int summed = priorRecords.stream()
                    .filter(r -> {
                        String rProc = StringUtils.hasText(r.getProcessName()) ? r.getProcessName().trim() : "";
                        String rKey = StringUtils.hasText(rProc) ? rProc
                                : (r.getOperationType() == null ? "" : r.getOperationType().trim().toUpperCase());
                        return rKey.equals(procKey);
                    })
                    .filter(r -> !StringUtils.hasText(r.getRemark()) || !r.getRemark().contains("撤销"))
                    .filter(r -> r.getQuantity() != null)
                    .mapToInt(PatternScanRecord::getQuantity)
                    .sum();
            if (summed + scanQty > taskQty) {
                int remaining = Math.max(0, taskQty - summed);
                throw new IllegalArgumentException("累计报工超限：该工序已报 " + summed + " 件，任务数量 "
                        + taskQty + " 件，本次最多可报 " + remaining + " 件");
            }
        }

        // D-145：防重复领取——样衣已被别人领取且未完成时，其他人不能再领（前端选项已过滤，此处兜底防并发/直调API）
        if ("RECEIVE".equalsIgnoreCase(operationType.trim())) {
            PatternScanRecord existingClaim = patternScanRecordService.lambdaQuery()
                    .eq(PatternScanRecord::getPatternProductionId, pattern.getId())
                    .eq(PatternScanRecord::getOperationType, "RECEIVE")
                    .eq(PatternScanRecord::getDeleteFlag, 0)
                    .orderByDesc(PatternScanRecord::getScanTime)
                    .last("LIMIT 1")
                    .one();
            if (existingClaim != null && StringUtils.hasText(existingClaim.getOperatorId())
                    && !existingClaim.getOperatorId().equals(UserContext.userId())) {
                throw new IllegalArgumentException("该样衣已被 " + existingClaim.getOperatorName() + " 领取，不能再重复领取");
            }
        }

        // MES 报工模型：领取工序（CLAIM）校验——工序须存在配置、未完成、未被他人领取
        boolean isClaimOperation = "CLAIM".equalsIgnoreCase(operationType.trim());
        if (isClaimOperation) {
            PatternScanRecord selfClaim = validateProcessClaim(pattern, processName);
            // D-167 幂等短路：本人已领取过该工序时直接返回既有记录，不再写重复 CLAIM（防连点产生垃圾记录）
            if (selfClaim != null) {
                return buildSubmitScanResult(selfClaim, patternId, pattern, operationType, UserContext.username(),
                        warehouseCode, selfClaim.getUnitPrice());
            }
        }

        String operatorId = UserContext.userId();
        String operatorName = UserContext.username();
        updatePatternQuantityIfNeeded(pattern, quantity, operatorName);

        // 优先使用前端传入的颜色/尺码，为空时 fallback 到样板单的值
        String effectiveColor = StringUtils.hasText(color) ? color : pattern.getColor();
        String effectiveSize = StringUtils.hasText(size) ? size : pattern.getSize();

        // P1 修复（工资链路断点4）：unitPrice 为空时兜底查 StyleProcess.price
        // 避免 workflowAction "complete" 路径传 null unitPrice 导致工资为 0
        BigDecimal effectiveUnitPrice = unitPrice;
        if (effectiveUnitPrice == null || effectiveUnitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            effectiveUnitPrice = lookupStyleProcessPrice(pattern.getStyleId(),
                    StringUtils.hasText(processName) ? processName : patternOperationLabel(operationType));
        }

        PatternScanRecord scanRecord = createPatternScanRecord(pattern, operationType, operatorId, operatorName,
                operatorRole, remark, quantity, effectiveColor, effectiveSize,
                warehouseCode, warehouseAreaId, warehouseLocationCode, processName, progressStage, effectiveUnitPrice);
        patternScanRecordService.save(scanRecord);

        // 自动追加操作日志到 PatternProduction.remarks（与大货 ProductionOrder.remarks 一致）
        appendPatternRemark(pattern, operationType, operatorName, scanRecord, unitPrice);

        // CLAIM（领取工序）不是报工：不写 t_scan_record 计件镜像（避免领取动作产生工资）
        if (!isClaimOperation) {
            syncToScanRecord(pattern, operationType, operatorId, operatorName, remark, effectiveUnitPrice,
                    effectiveColor, effectiveSize, scanRecord.getQuantity());
        }
        statusHelper.updatePatternStatusByOperation(pattern, operationType, operatorName);

        if ("COMPLETE".equals(operationType.trim()) || "WAREHOUSE_IN".equals(operationType.trim())) {
            statusHelper.syncStyleInfoSampleStage(pattern);
        }

        // CLAIM（领取工序）不是报工：不写计件工资镜像、不同步库存
        if (!isClaimOperation) {
            stockHelper.syncStockByOperation(pattern, scanRecord, operationType, operatorId, operatorName);
            statusHelper.syncStyleInfoOnScan(pattern.getStyleId(), operatorName, operationType);
        }

        return buildSubmitScanResult(scanRecord, patternId, pattern, operationType, operatorName, warehouseCode, effectiveUnitPrice);
    }

    private void assertSubmitScanParams(String patternId, String operationType) {
        if (!StringUtils.hasText(patternId)) throw new IllegalArgumentException("样板生产ID不能为空");
        if (!StringUtils.hasText(operationType)) throw new IllegalArgumentException("操作类型不能为空");
    }

    /**
     * MES 报工模型：领取工序（CLAIM）校验
     * 0. 工序必须在款式工序配置内（防止领取不存在的工序导致工序列表状态无法联动）
     * 1. 工序名必填（领取必须指明哪道工序）
     * 2. 工序未完成（存在非 CLAIM 的完成记录则拒绝）
     * 3. 工序未被他人领取（存在他人的 CLAIM 记录且未完成则拒绝；本人重复领取幂等放行）
     */
    private PatternScanRecord validateProcessClaim(PatternProduction pattern, String processName) {
        if (!StringUtils.hasText(processName)) {
            throw new IllegalArgumentException("领取工序时工序名（processName）不能为空");
        }
        String target = processName.trim();

        // 0. 工序必须在该款式的工序配置内
        Long styleIdLong;
        try {
            styleIdLong = Long.valueOf(pattern.getStyleId().trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("样板生产记录缺少有效款式ID，无法校验工序配置");
        }
        List<com.fashion.supplychain.style.entity.StyleProcess> configProcesses = styleProcessService.lambdaQuery()
                .eq(com.fashion.supplychain.style.entity.StyleProcess::getStyleId, styleIdLong)
                .list();
        boolean inConfig = configProcesses != null && configProcesses.stream().anyMatch(sp -> {
            String name = sp.getProcessName() == null ? "" : sp.getProcessName().trim();
            return target.equals(name);
        });
        if (!inConfig) {
            throw new IllegalArgumentException("工序【" + target + "】不在该款式的工序配置中，无法领取");
        }

        List<PatternScanRecord> records = patternScanRecordService.lambdaQuery()
                .eq(PatternScanRecord::getPatternProductionId, pattern.getId())
                .eq(PatternScanRecord::getDeleteFlag, 0)
                .list();
        if (records == null || records.isEmpty()) {
            return null;
        }

        String currentUserId = UserContext.userId();
        PatternScanRecord latestClaim = null;
        for (PatternScanRecord r : records) {
            String opType = r.getOperationType() == null ? "" : r.getOperationType().trim();
            String recordProcess = r.getProcessName() == null ? "" : r.getProcessName().trim();
            boolean sameProcess = target.equals(recordProcess)
                    || target.equalsIgnoreCase(opType);
            if (!sameProcess) {
                continue;
            }
            if ("CLAIM".equalsIgnoreCase(opType)) {
                if (latestClaim == null
                        || (r.getScanTime() != null && (latestClaim.getScanTime() == null
                            || r.getScanTime().isAfter(latestClaim.getScanTime())))) {
                    latestClaim = r;
                }
            } else {
                // 非 CLAIM 的匹配记录 = 该工序已完成报工
                throw new IllegalArgumentException("工序【" + target + "】已完成报工，无需领取");
            }
        }

        if (latestClaim != null) {
            if (StringUtils.hasText(latestClaim.getOperatorId())
                    && !latestClaim.getOperatorId().equals(currentUserId)) {
                throw new IllegalArgumentException("工序【" + target + "】已由 " + latestClaim.getOperatorName() + " 领取制作中");
            }
            return latestClaim;
        }
        return null;
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

    /**
     * P1 修复（工资链路断点1/2/3）：
     * 1. 同步写 unitPrice（旧字段）+ processUnitPrice（新字段），保证工资 SQL 三层兜底都能命中
     * 2. 同步写 totalAmount（= unitPrice × qty），保证工资 SQL 第一层兜底命中
     * 3. 移除 try-catch，fail-safe 让外层 @Transactional 回滚，避免镜像悬挂
     * 4. 与 submitScan 的 createPatternScanRecord 保持字段一致
     */
    private void syncToScanRecord(PatternProduction pattern, String operationType,
            String operatorId, String operatorName, String remark, BigDecimal unitPrice,
            String effectiveColor, String effectiveSize, Integer scanQuantity) {
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
        // D-172：工资镜像数量优先用本次扫码数量（样衣按件统计），扫码数量无效时才回退样板计划数量
        int patternQty;
        if (scanQuantity != null && scanQuantity > 0) {
            patternQty = scanQuantity;
        } else if (pattern.getQuantity() != null && pattern.getQuantity() > 0) {
            patternQty = pattern.getQuantity();
        } else {
            patternQty = 1;
        }
        sr.setQuantity(patternQty);
        if (unitPrice != null && unitPrice.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal totalCost = unitPrice.multiply(BigDecimal.valueOf(patternQty));
            // 双写：unitPrice（旧字段） + processUnitPrice（新字段）
            sr.setUnitPrice(unitPrice);
            sr.setProcessUnitPrice(unitPrice);
            sr.setScanCost(totalCost);
            sr.setTotalAmount(totalCost);
        }
        sr.setTenantId(UserContext.tenantId());
        sr.setFactoryId(null);
        // 样衣没有菲号概念，保留 null（cuttingBundleNo 字段为 Integer 类型）
        sr.setCuttingBundleNo(null);
        sr.setRemark(remark);
        sr.setCreateTime(LocalDateTime.now());
        scanRecordService.saveScanRecord(sr);
    }

    /**
     * P1 修复（工资链路断点4兜底）：查询 StyleProcess.price 作为 unitPrice 兜底
     * <p>
     * 匹配策略（按精确度递减）：
     * 1. processName 精确匹配（前端传入的工序名）
     * 2. processCode 匹配（operationType 作为 code）
     * 3. processName LIKE 模糊匹配（容忍"完成确认" vs "完成"等差异）
     * 4. 返回 null（查不到，工资为 0，由人工补录）
     */
    private BigDecimal lookupStyleProcessPrice(String styleId, String processNameOrLabel) {
        if (!StringUtils.hasText(styleId) || !StringUtils.hasText(processNameOrLabel)) {
            return null;
        }
        try {
            Long sid = Long.valueOf(styleId);
            // 策略1：processName 精确匹配
            com.fashion.supplychain.style.entity.StyleProcess sp = styleProcessService.lambdaQuery()
                    .eq(com.fashion.supplychain.style.entity.StyleProcess::getStyleId, sid)
                    .eq(com.fashion.supplychain.style.entity.StyleProcess::getProcessName, processNameOrLabel)
                    .last("LIMIT 1")
                    .one();
            if (sp != null && sp.getPrice() != null && sp.getPrice().compareTo(BigDecimal.ZERO) > 0) {
                return sp.getPrice();
            }
            // 策略2：模糊匹配（processName 包含查询关键词，或反过来）
            List<com.fashion.supplychain.style.entity.StyleProcess> candidates = styleProcessService.lambdaQuery()
                    .eq(com.fashion.supplychain.style.entity.StyleProcess::getStyleId, sid)
                    .last("LIMIT 50")
                    .list();
            if (candidates != null) {
                for (com.fashion.supplychain.style.entity.StyleProcess p : candidates) {
                    if (p.getPrice() == null || p.getPrice().compareTo(BigDecimal.ZERO) <= 0) continue;
                    String pn = p.getProcessName();
                    if (pn == null) continue;
                    if (pn.contains(processNameOrLabel) || processNameOrLabel.contains(pn)) {
                        return p.getPrice();
                    }
                }
            }
            return null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Map<String, Object> buildSubmitScanResult(PatternScanRecord scanRecord, String patternId,
            PatternProduction pattern, String operationType, String operatorName, String warehouseCode,
            BigDecimal effectiveUnitPrice) {
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
        result.put("newStatusLabel", StatusTranslator.translateStatus(pattern.getStatus()));
        result.put("unitPrice", effectiveUnitPrice);
        // 工序单价缺失提示：款式未配置该工序单价时工资按 0 记录，扫码当场提醒用户去补配
        if (effectiveUnitPrice == null || effectiveUnitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            result.put("unitPriceMissing", true);
            result.put("unitPriceMissingTip", "该款式未配置【" + patternOperationLabel(operationType)
                    + "】工序单价，本次工资按 0 记录。请到 款式资料→工序配置 中补充工序单价。");
        }
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
     * 通用备注日志追加（不依赖扫码场景）
     * 用于非扫码类操作（领取/进度更新/完成/审核/维护/撤销扫码/指派/二次工艺/删除/基本信息更新）
     * 与大货 OrderRemarkHelper.append(order, action, detail) 签名对齐
     *
     * 双写：
     * 1. PatternProduction.remarks 字段（inline，最近 20 条，最多 4000 字符）
     * 2. t_order_remark 表（targetType="pattern"）
     *
     * @param pattern 样板生产记录（必须含 id 和 tenantId）
     * @param action  动作标签，如"领取样板"/"制作完成"/"审核通过"等
     * @param detail  详情，可为空
     */
    private void appendPatternRemarkSimple(PatternProduction pattern, String action, String detail) {
        if (pattern == null || !StringUtils.hasText(pattern.getId())) {
            return;
        }
        try {
            String operatorName = UserContext.username();
            if (!StringUtils.hasText(operatorName)) {
                operatorName = UserContext.userId();
            }
            if (!StringUtils.hasText(operatorName)) {
                operatorName = "系统";
            }
            String now = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                    .format(java.time.LocalDateTime.now());
            // 格式与大货一致：[yyyy-MM-dd HH:mm:ss] 操作人 动作：详情
            StringBuilder line = new StringBuilder();
            line.append("[").append(now).append("] ");
            line.append(operatorName).append(" ").append(action);
            if (StringUtils.hasText(detail)) {
                line.append("：").append(detail);
            }
            String newEntry = line.toString();

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
            try {
                if (orderRemarkService != null) {
                    com.fashion.supplychain.system.entity.OrderRemark record =
                            new com.fashion.supplychain.system.entity.OrderRemark();
                    record.setTargetType("pattern");
                    record.setTargetNo(String.valueOf(fresh.getId()));
                    record.setAuthorName(operatorName);
                    record.setAuthorRole(action);
                    record.setContent(newEntry);
                    record.setTenantId(fresh.getTenantId());
                    record.setCreateTime(LocalDateTime.now());
                    record.setDeleteFlag(0);
                    orderRemarkService.save(record);
                }
            } catch (Exception e) {
                log.warn("样衣操作同步t_order_remark失败，不影响主流程: patternId={}, action={}, error={}",
                        pattern.getId(), action, e.getMessage());
            }
        } catch (Exception e) {
            log.warn("样衣操作追加备注日志失败，不影响主流程: patternId={}, action={}, error={}",
                    pattern.getId(), action, e.getMessage());
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
        response.put("newStatusLabel", StatusTranslator.translateStatus(pattern.getStatus()));
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
     * 获取样板生产时间线（联表 t_pattern_scan_record 聚合各节点时间，不新增字段）。
     * <p>
     * 节点：创建 → 领取 → 制作开始 → 制作完成 → 审核 → 入库 → 出库 → 归还
     * <ul>
     *   <li>每个节点附操作人和与上一节点的时间差（小时）</li>
     *   <li>anomalies：根据节点间隔阈值识别异常（领取→完成&gt;7天、完成→审核&gt;2天、审核→入库&gt;3天）</li>
     * </ul>
     * 多租户隔离：PatternProduction + PatternScanRecord 均带 tenant_id 校验（P0 铁律4）。
     */
    public Map<String, Object> getPatternTimeline(String patternId) {
        if (!StringUtils.hasText(patternId)) {
            throw new IllegalArgumentException("样板生产ID不能为空");
        }
        PatternProduction pattern = getPatternWithTenant(patternId);
        if (pattern == null || pattern.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("样板生产记录不存在");
        }
        Long tenantId = UserContext.tenantId();

        // 查询扫码记录，按 scanTime ASC（P0 铁律4：tenant_id 过滤）
        List<PatternScanRecord> scans = patternScanRecordService.list(
                new LambdaQueryWrapper<PatternScanRecord>()
                        .eq(PatternScanRecord::getPatternProductionId, patternId)
                        .eq(PatternScanRecord::getTenantId, tenantId)
                        .eq(PatternScanRecord::getDeleteFlag, 0)
                        .orderByAsc(PatternScanRecord::getScanTime));

        // 聚合各节点（取每个节点第一条记录的时间/操作人）
        LocalDateTime receiveTime = null; String receiveOp = null;
        LocalDateTime prodStartTime = null; String prodStartOp = null;
        LocalDateTime completeScanTime = null; String completeOp = null;
        LocalDateTime warehouseInTime = null; String warehouseInOp = null;
        LocalDateTime warehouseOutTime = null; String warehouseOutOp = null;
        LocalDateTime warehouseReturnTime = null; String warehouseReturnOp = null;
        if (scans != null) {
            for (PatternScanRecord s : scans) {
                String op = s.getOperationType();
                if (op == null) continue;
                switch (op) {
                    case "RECEIVE":
                        if (receiveTime == null) { receiveTime = s.getScanTime(); receiveOp = s.getOperatorName(); }
                        break;
                    case "PLATE": case "CUTTING": case "SEWING": case "FOLLOW_UP":
                        if (prodStartTime == null) { prodStartTime = s.getScanTime(); prodStartOp = s.getOperatorName(); }
                        break;
                    case "COMPLETE":
                        if (completeScanTime == null) { completeScanTime = s.getScanTime(); completeOp = s.getOperatorName(); }
                        break;
                    case "WAREHOUSE_IN":
                        if (warehouseInTime == null) { warehouseInTime = s.getScanTime(); warehouseInOp = s.getOperatorName(); }
                        break;
                    case "WAREHOUSE_OUT":
                        if (warehouseOutTime == null) { warehouseOutTime = s.getScanTime(); warehouseOutOp = s.getOperatorName(); }
                        break;
                    case "WAREHOUSE_RETURN":
                        if (warehouseReturnTime == null) { warehouseReturnTime = s.getScanTime(); warehouseReturnOp = s.getOperatorName(); }
                        break;
                    default: break;
                }
            }
        }
        // 审核节点取自 PatternProduction 主记录（不是扫码 operationType）
        LocalDateTime reviewTime = pattern.getReviewTime();
        String reviewBy = pattern.getReviewBy();

        // 构建节点列表（按时间顺序，缺失节点跳过）
        List<Map<String, Object>> nodes = new ArrayList<>();
        LocalDateTime prevTime = null;
        prevTime = appendTimelineNode(nodes, "创建", pattern.getCreateTime(), pattern.getCreateBy(), prevTime);
        prevTime = appendTimelineNode(nodes, "领取", receiveTime, receiveOp, prevTime);
        prevTime = appendTimelineNode(nodes, "制作开始", prodStartTime, prodStartOp, prevTime);
        prevTime = appendTimelineNode(nodes, "制作完成", completeScanTime, completeOp, prevTime);
        prevTime = appendTimelineNode(nodes, "审核", reviewTime, reviewBy, prevTime);
        prevTime = appendTimelineNode(nodes, "入库", warehouseInTime, warehouseInOp, prevTime);
        prevTime = appendTimelineNode(nodes, "出库", warehouseOutTime, warehouseOutOp, prevTime);
        appendTimelineNode(nodes, "归还", warehouseReturnTime, warehouseReturnOp, prevTime);

        // anomalies 检测（阈值：领取→完成>7天、完成→审核>2天、审核→入库>3天）
        List<String> anomalies = new ArrayList<>();
        if (receiveTime != null && completeScanTime != null) {
            long days = ChronoUnit.DAYS.between(receiveTime, completeScanTime);
            if (days > 7) anomalies.add("制作停滞 " + days + " 天");
        }
        if (completeScanTime != null && reviewTime != null) {
            long days = ChronoUnit.DAYS.between(completeScanTime, reviewTime);
            if (days > 2) anomalies.add("审核拖延 " + days + " 天");
        }
        if (reviewTime != null && warehouseInTime != null) {
            long days = ChronoUnit.DAYS.between(reviewTime, warehouseInTime);
            if (days > 3) anomalies.add("入库拖延 " + days + " 天");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("patternId", patternId);
        result.put("styleNo", pattern.getStyleNo());
        result.put("status", pattern.getStatus());
        result.put("nodes", nodes);
        result.put("anomalies", anomalies);
        return result;
    }

    /** 追加时间线节点，返回该节点时间作为下一节点的 prevTime（节点时间为 null 则跳过） */
    private LocalDateTime appendTimelineNode(List<Map<String, Object>> nodes, String nodeLabel,
                                              LocalDateTime time, String operator, LocalDateTime prevTime) {
        if (time == null) return prevTime;
        Map<String, Object> n = new HashMap<>();
        n.put("node", nodeLabel);
        n.put("time", time);
        n.put("operator", operator);
        n.put("durationHours", prevTime == null ? 0 : Duration.between(prevTime, time).toHours());
        nodes.add(n);
        return time;
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
            case "CLAIM":            return "领取工序";
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

    /**
     * P1 修复（工资链路断点3）：completeByTask 路径单价兜底
     * <p>
     * 原问题：用 processLabel（如"完成确认"）精确匹配 StyleProcess.processName（如"裁剪"），
     * 大概率匹配不到，单价为 null，工资为 0。
     * <p>
     * 修复策略：
     * 1. 使用 lookupStyleProcessPrice 模糊匹配（精确 → 包含 → 反包含）
     * 2. 双写 unitPrice + processUnitPrice + scanCost + totalAmount，与 syncToScanRecord 一致
     * 3. 移除 try-catch，fail-safe 让外层事务回滚
     */
    private void createPatternScanRecordForWage(PatternProduction pattern, String processLabel,
                                                  String operatorId, String operatorName, LocalDateTime scanTime) {
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
        // 兜底查询单价，避免工资为 0
        BigDecimal unitPrice = lookupStyleProcessPrice(pattern.getStyleId(), processLabel);
        if (unitPrice != null && unitPrice.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal totalCost = unitPrice.multiply(BigDecimal.valueOf(qty));
            sr.setUnitPrice(unitPrice);
            sr.setProcessUnitPrice(unitPrice);
            sr.setScanCost(totalCost);
            sr.setTotalAmount(totalCost);
        }
        scanRecordService.saveScanRecord(sr);
    }

    /**
     * 撤销样衣扫码记录（管理员/主管权限）
     * <p>
     * P1 修复（数据链路闭环）：
     * 1. 多租户校验 PatternScanRecord + PatternProduction（P0 铁律4）
     * 2. 工资结算状态校验（防止已结算的扫码记录被撤回导致工资单数据悬挂）
     * 3. 同步删除 ScanRecord 镜像（scanType="pattern"，与 submitScan 的 syncToScanRecord 对称）
     * 4. 写备注日志（与 submitScan 的 appendPatternRemark 对称，双写 PatternProduction.remarks + t_order_remark）
     * 5. 时间窗规则对齐 ScanUndoHelper（管理员 5h / 普通 30min，原代码统一 30min 对管理员过严）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> undoPatternScan(String scanRecordId) {
        if (!StringUtils.hasText(scanRecordId)) {
            throw new IllegalArgumentException("扫码记录ID不能为空");
        }

        // P2 修复：入口校验租户上下文
        TenantAssert.assertTenantContext();

        PatternScanRecord scanRecord = patternScanRecordService.getById(scanRecordId);
        if (scanRecord == null || scanRecord.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("扫码记录不存在");
        }

        // P1 修复 1：多租户校验（P0 铁律4）
        TenantAssert.assertBelongsToCurrentTenant(scanRecord.getTenantId(), "样衣扫码记录");

        String operatorName = UserContext.username();
        UserContext ctx = UserContext.get();

        // P1 修复 2：时间窗规则对齐 ScanUndoHelper（管理员 5h / 普通 30min）
        // scanTime 为 null 时用 createTime 兜底；两者都为 null 则拒绝撤回（保守策略）
        LocalDateTime scanTime = scanRecord.getScanTime() != null
                ? scanRecord.getScanTime() : scanRecord.getCreateTime();
        if (scanTime == null) {
            throw new IllegalStateException("扫码记录缺少时间信息，无法撤回，请联系管理员");
        }
        boolean isAdmin = isAdminRole(ctx);
        boolean undoExpired = isAdmin
                ? scanTime.plusHours(5).isBefore(LocalDateTime.now())
                : scanTime.plusMinutes(30).isBefore(LocalDateTime.now());
        if (undoExpired) {
            throw new IllegalStateException(isAdmin
                    ? "只能撤回5小时内的扫码记录（管理员权限）"
                    : "只能撤回30分钟内的扫码记录，如需撤回请联系管理员");
        }

        String patternProductionId = scanRecord.getPatternProductionId();
        if (!StringUtils.hasText(patternProductionId)) {
            throw new IllegalArgumentException("扫码记录缺少样板生产ID");
        }

        PatternProduction pattern = patternProductionService.getById(patternProductionId);
        if (pattern == null || pattern.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("关联的样板生产记录不存在");
        }

        // P1 修复 1：多租户校验样板生产
        TenantAssert.assertBelongsToCurrentTenant(pattern.getTenantId(), "样板生产");

        // P1 修复 3：工资结算状态校验 + 同步删除 ScanRecord 镜像
        // submitScan 时 syncToScanRecord 会向 t_scan_record 写一条 scanType="pattern" 镜像
        // 撤销时必须同步删除该镜像，否则工资统计仍会算这笔钱（数据悬挂）
        // P1 修复 5：镜像删除失败必须让事务回滚（不允许 try-catch 吞异常导致悬挂）
        ScanRecord mirrorScanRecord = findPatternScanRecordMirror(scanRecord);
        if (mirrorScanRecord != null) {
            if (StringUtils.hasText(mirrorScanRecord.getPayrollSettlementId())) {
                throw new IllegalStateException("该扫码记录已参与工资结算，无法撤回");
            }
            if ("payroll_settled".equals(mirrorScanRecord.getSettlementStatus())) {
                throw new IllegalStateException("该扫码记录已参与工资结算，无法撤回");
            }
        }

        // 软删 PatternScanRecord
        scanRecord.setDeleteFlag(1);
        patternScanRecordService.updateById(scanRecord);

        // 硬删 ScanRecord 镜像（与大货 ScanUndoHelper.undoNormalScan 一致，ScanRecord 无 deleteFlag 字段）
        // P1 修复 5：删除失败必须抛异常触发事务回滚，避免 PatternScanRecord 软删但 ScanRecord 留存的数据悬挂
        if (mirrorScanRecord != null) {
            scanRecordService.removeById(mirrorScanRecord.getId());
            log.info("[样衣撤回] 同步删除ScanRecord镜像: mirrorId={}", mirrorScanRecord.getId());
        }

        log.info("[样衣撤回] scanRecordId={} operationType={} operatorName={} undoBy={}",
                scanRecordId, scanRecord.getOperationType(), scanRecord.getOperatorName(), operatorName);

        // P1 修复 4：写备注日志（与 submitScan 的 appendPatternRemark 对称）
        // appendPatternRemarkSimple 会双写 PatternProduction.remarks + t_order_remark
        // 备注日志失败不阻塞主流程（仅日志，不影响数据一致性）
        String actionLabel = "撤销扫码";
        String detail = patternOperationLabel(scanRecord.getOperationType())
                + (StringUtils.hasText(scanRecord.getProcessName()) ? "·" + scanRecord.getProcessName() : "")
                + (scanRecord.getQuantity() != null ? "·数量" + scanRecord.getQuantity() : "")
                + (StringUtils.hasText(scanRecord.getColor()) ? "·" + scanRecord.getColor() : "")
                + (StringUtils.hasText(scanRecord.getSize()) ? "·" + scanRecord.getSize() : "");
        try {
            appendPatternRemarkSimple(pattern, actionLabel, detail);
        } catch (Exception e) {
            log.warn("[样衣撤回] 写备注日志失败（不阻塞主流程）: patternId={}, err={}",
                    pattern.getId(), e.getMessage());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "已撤销扫码记录");
        result.put("scanRecordId", scanRecordId);
        result.put("undoBy", operatorName);
        result.put("mirrorScanRecordId", mirrorScanRecord != null ? mirrorScanRecord.getId() : null);
        return result;
    }

    /**
     * P1 修复：查找样衣扫码对应的 ScanRecord 镜像（scanType="pattern"）
     * <p>
     * 匹配策略（按 scanTime 降序取最近一条）：
     * - scanType = "pattern"
     * - tenantId = 当前租户
     * - operatorId = PatternScanRecord.operatorId（必填，null 时返回 null 避免误删）
     * - styleNo = PatternScanRecord.styleNo（必填，null 时返回 null 避免误删）
     * - scanTime 在 PatternScanRecord.scanTime ±60 秒内（容忍时钟漂移，
     *   因 syncToScanRecord 用 LocalDateTime.now() 重新取时间，与 PatternScanRecord.scanTime 略有差异）
     * <p>
     * P1 修复 6：关键匹配字段为 null 时直接返回 null，避免 LambdaQueryWrapper
     * 静默忽略 null 条件导致误删其他操作员/其他款号的镜像
     */
    private ScanRecord findPatternScanRecordMirror(PatternScanRecord scanRecord) {
        if (scanRecord == null || scanRecord.getScanTime() == null) {
            return null;
        }
        // P1 修复 6：operatorId / styleNo 关键匹配字段为 null 时不查询，避免误删
        if (!StringUtils.hasText(scanRecord.getOperatorId())
                || !StringUtils.hasText(scanRecord.getStyleNo())) {
            log.warn("[样衣撤回] PatternScanRecord 缺少 operatorId/styleNo，跳过镜像删除避免误删: id={}, operatorId={}, styleNo={}",
                    scanRecord.getId(), scanRecord.getOperatorId(), scanRecord.getStyleNo());
            return null;
        }
        try {
            LocalDateTime scanTime = scanRecord.getScanTime();
            LocalDateTime start = scanTime.minusSeconds(60);
            LocalDateTime end = scanTime.plusSeconds(60);
            Long tenantId = UserContext.tenantId();
            List<ScanRecord> candidates = scanRecordService.list(
                    new LambdaQueryWrapper<ScanRecord>()
                            .eq(ScanRecord::getScanType, "pattern")
                            .eq(ScanRecord::getTenantId, tenantId)
                            .eq(ScanRecord::getOperatorId, scanRecord.getOperatorId())
                            .eq(ScanRecord::getStyleNo, scanRecord.getStyleNo())
                            .between(ScanRecord::getScanTime, start, end)
                            .orderByDesc(ScanRecord::getScanTime)
                            .last("LIMIT 1"));
            return (candidates != null && !candidates.isEmpty()) ? candidates.get(0) : null;
        } catch (Exception e) {
            log.warn("[样衣撤回] 查找ScanRecord镜像失败: patternScanRecordId={}, err={}",
                    scanRecord.getId(), e.getMessage());
            return null;
        }
    }

    /**
     * P1 修复：判断是否管理员角色（与 ScanUndoHelper.isAdminRole 对齐）
     * ADMIN_ROLE_KEYWORDS = {"admin", "ADMIN", "manager", "supervisor", "主管", "管理员"}
     */
    private boolean isAdminRole(UserContext ctx) {
        if (ctx == null) return false;
        String role = ctx.getRole();
        if (role == null) return false;
        return role.contains("admin") || role.contains("ADMIN")
                || role.contains("manager") || role.contains("supervisor")
                || role.contains("主管") || role.contains("管理员");
    }

    /**
     * 指派样板生产给指定人员
     * D-P2-7：扩展接收 quantity（多色多码场景下让用户在弹窗里确认/调整数量）
     */
    public void assignPattern(String patternId, String assignee) {
        assignPattern(patternId, assignee, null);
    }

    /**
     * 指派样板生产给指定人员（带数量）
     * @param patternId 样板生产ID
     * @param assignee 指派人员姓名
     * @param quantity 指派数量（可选，null 或 <=0 表示不修改原数量）
     */
    public void assignPattern(String patternId, String assignee, Integer quantity) {
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

        // D-P2-7：若传入有效数量，更新 PatternProduction.quantity
        // 多色多码场景下，工人需要明确"我负责多少件"
        if (quantity != null && quantity > 0) {
            Integer oldQty = pattern.getQuantity();
            pattern.setQuantity(quantity);
            log.info("[样衣指派] 数量更新: patternId={} oldQty={} newQty={}", patternId, oldQty, quantity);
        }

        if ("PENDING".equals(currentStatus)) {
            pattern.setStatus("IN_PROGRESS");
            pattern.setReceiveTime(LocalDateTime.now());
            log.info("[样衣指派] 自动领取: patternId={} assignee={}", patternId, assignee);
        }

        patternProductionService.updateById(pattern);

        log.info("[样衣指派] patternId={} assignee={} color={} size={} qty={} oldStatus={} newStatus={}",
                patternId, assignee, pattern.getColor(), pattern.getSize(), pattern.getQuantity(),
                currentStatus, pattern.getStatus());
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
