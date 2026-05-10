package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.helper.ProductWarehousingRepairHelper;
import com.fashion.supplychain.production.helper.ProcessParentNodeResolver;
import com.fashion.supplychain.production.helper.TrackingPriceBatchHelper;
import com.fashion.supplychain.production.helper.TrackingPriceSyncHelper;
import com.fashion.supplychain.production.helper.TrackingRecordInitHelper;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.service.OrderRemarkService;
import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 工序跟踪编排器 — 协调初始化、扫码更新、单价同步等业务。
 * <p>
 * 重逻辑已委托给：
 * <ul>
 *   <li>{@link TrackingRecordInitHelper} — 初始化 &amp; 追加跟踪记录</li>
 *   <li>{@link TrackingPriceSyncHelper} — 单价同步、价格刷新、查询、修复</li>
 * </ul>
 */
@Slf4j
@Service
public class ProductionProcessTrackingOrchestrator {

    @Autowired
    private ProductionProcessTrackingService trackingService;

    @Autowired
    private ProcessParentMappingService processParentMappingService;

    @Autowired
    private TrackingRecordInitHelper initHelper;

    @Autowired
    private TrackingPriceSyncHelper priceSyncHelper;

    @Autowired
    private TrackingPriceBatchHelper priceBatchHelper;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductWarehousingRepairHelper repairHelper;

    @Autowired
    private OrderRemarkService orderRemarkService;

    @Autowired
    private ProcessParentNodeResolver parentNodeResolver;

    // ========== 委托方法：初始化与追加 ==========

    /**
     * 初始化工序跟踪记录（裁剪完成时调用）
     * 委托给 {@link TrackingRecordInitHelper#initializeProcessTracking}
     */
    @Transactional(rollbackFor = Exception.class)
    public int initializeProcessTracking(String productionOrderId) {
        return initHelper.initializeProcessTracking(productionOrderId);
    }

    /**
     * 追加工序跟踪记录（新增菲号时调用）
     * 委托给 {@link TrackingRecordInitHelper#appendProcessTracking}
     */
    @Transactional(rollbackFor = Exception.class)
    public int appendProcessTracking(String productionOrderId, List<CuttingBundle> bundles) {
        return initHelper.appendProcessTracking(productionOrderId, bundles);
    }

    // ========== 扫码记录更新（保留原始逻辑） ==========

    /**
     * 更新扫码记录（扫码时调用）
     *
     * 防重复逻辑：菲号+工序唯一（数据库 UNIQUE KEY）
     *
     * @param cuttingBundleId 菲号ID（String类型）
     * @param processCode 工序编号
     * @param operatorId 操作人ID（String类型）
     * @param operatorName 操作人姓名
     * @param scanRecordId 扫码记录ID（关联 t_scan_record，String类型）
     * @return 更新成功返回true，记录不存在或已扫码返回false
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean updateScanRecord(String cuttingBundleId, String processCode,
                                   String operatorId, String operatorName, String scanRecordId) {

        // 1. 查询跟踪记录（先按processCode精确匹配，再按processName回退匹配）
        ProductionProcessTracking tracking = trackingService.getByBundleAndProcess(cuttingBundleId, processCode);

        if (tracking == null) {
            tracking = trackingService.getByBundleAndProcessName(cuttingBundleId, processCode);
            if (tracking != null) {
                log.info("通过processName回退匹配成功：菲号ID={}, processCode={} → processName={}",
                        cuttingBundleId, processCode, tracking.getProcessName());
                // ★ 不覆盖 processCode：tracking 表初始化时 processCode 存的是模板编号（如 "02"），
                // 扫码端传入的 processCode 是子工序名（如 "打揽"），覆盖会导致编号丢失
            }
        }

        // 第三级回退：通过 t_process_parent_mapping 父节点映射匹配同义工序
        // 场景：款式定义"大烫"但扫码端发送"整烫"，两者都映射到父节点"尾部"
        if (tracking == null) {
            tracking = matchBySameParentNode(cuttingBundleId, processCode);
        }

        if (tracking == null) {
            log.warn("未找到跟踪记录：菲号ID={}, 工序={}", cuttingBundleId, processCode);
            return false;
        }

        // 2. 检查是否已扫码（防重复）
        if ("scanned".equals(tracking.getScanStatus())) {
            log.warn("菲号「{}」工序已被「{}」领取，跳过重复扫码: bundleId={}, processCode={}",
                    tracking.getProcessName(), tracking.getOperatorName(), cuttingBundleId, processCode);
            return false;
        }

        // 3. 更新扫码状态
        tracking.setScanStatus("scanned");
        tracking.setScanTime(LocalDateTime.now());
        tracking.setScanRecordId(scanRecordId);
        tracking.setOperatorId(operatorId);
        tracking.setOperatorName(operatorName);

        // 4. 计算结算金额
        if (tracking.getUnitPrice() != null && tracking.getQuantity() != null) {
            BigDecimal amount = tracking.getUnitPrice().multiply(new BigDecimal(tracking.getQuantity()));
            tracking.setSettlementAmount(amount);
        }

        tracking.setUpdater(UserContext.username() != null ? UserContext.username() : "system");

        boolean success = trackingService.updateById(tracking);

        log.info("工序跟踪记录更新：菲号={}, 工序={}, 操作人={}, 金额={}",
                tracking.getBundleNo(), tracking.getProcessName(), operatorName, tracking.getSettlementAmount());

        return success;
    }

    /**
     * 第三级回退匹配：通过 t_process_parent_mapping 父节点映射找同义工序
     * <p>
     * 场景：款式定义了"大烫"，但扫码端发送"整烫"。两者都映射到父节点"尾部"，
     * 通过父节点匹配 + 字符相似度选出最佳 tracking 记录。
     * </p>
     *
     * @param cuttingBundleId 菲号ID
     * @param processCode 扫码端传入的工序名
     * @return 匹配到的 tracking 记录，未找到返回 null
     */
    private ProductionProcessTracking matchBySameParentNode(String cuttingBundleId, String processCode) {
        String incomingParent = processParentMappingService.resolveParentNode(processCode);
        if (incomingParent == null) {
            return null;
        }

        // 获取该菲号所有 tracking 记录，筛选同父节点 + pending 状态
        List<ProductionProcessTracking> allTracking = trackingService.getByBundleId(cuttingBundleId);
        List<ProductionProcessTracking> candidates = allTracking.stream()
                .filter(t -> "pending".equals(t.getScanStatus()))
                .filter(t -> {
                    String trackingParent = processParentMappingService.resolveParentNode(t.getProcessCode());
                    return incomingParent.equals(trackingParent);
                })
                .collect(Collectors.toList());

        if (candidates.isEmpty()) {
            return null;
        }

        ProductionProcessTracking matched;
        if (candidates.size() == 1) {
            matched = candidates.get(0);
        } else {
            // 多个同父节点候选：用字符重叠度选最佳（如"整烫"和"大烫"共享"烫"字）
            matched = candidates.stream()
                    .max((a, b) -> charOverlap(processCode, a.getProcessCode())
                            - charOverlap(processCode, b.getProcessCode()))
                    .filter(t -> charOverlap(processCode, t.getProcessCode()) > 0)
                    .orElse(null);
        }

        if (matched != null) {
            log.info("通过父节点映射回退匹配成功：菲号ID={}, 扫码工序={} → tracking工序={}, 父节点={}",
                    cuttingBundleId, processCode, matched.getProcessCode(), incomingParent);
        }
        return matched;
    }

    /**
     * 计算两个字符串的字符重叠数（用于同义工序名相似度判断）
     */
    private int charOverlap(String a, String b) {
        if (a == null || b == null) return 0;
        int overlap = 0;
        for (char c : a.toCharArray()) {
            if (b.indexOf(c) >= 0) overlap++;
        }
        return overlap;
    }

    /**
     * 强制更新裁剪工序的扫码记录（用于裁剪完成时覆盖初始化的默认值）
     * 与updateScanRecord不同，此方法跳过防重复检查，强制更新裁剪操作人和时间
     *
     * @param cuttingBundleId 菲号ID
     * @param operatorId 操作人ID
     * @param operatorName 操作人姓名
     * @param scanRecordId 扫码记录ID
     * @return 更新成功返回true
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean forcedUpdateCuttingScan(String cuttingBundleId, String operatorId,
                                          String operatorName, String scanRecordId) {
        // 查询裁剪工序的跟踪记录
        ProductionProcessTracking tracking = trackingService.getByBundleAndProcess(cuttingBundleId, "裁剪");

        if (tracking == null) {
            // 回退：用processName查询
            tracking = trackingService.getByBundleAndProcessName(cuttingBundleId, "裁剪");
        }

        if (tracking == null) {
            log.warn("未找到裁剪工序跟踪记录：菲号ID={}", cuttingBundleId);
            return false;
        }

        // 强制更新（不检查scanStatus）
        tracking.setScanStatus("scanned");
        tracking.setScanTime(LocalDateTime.now());
        tracking.setScanRecordId(scanRecordId);
        tracking.setOperatorId(operatorId);
        tracking.setOperatorName(operatorName);

        // 计算结算金额
        if (tracking.getUnitPrice() != null && tracking.getQuantity() != null) {
            BigDecimal amount = tracking.getUnitPrice().multiply(new BigDecimal(tracking.getQuantity()));
            tracking.setSettlementAmount(amount);
        }

        tracking.setUpdater(UserContext.username() != null ? UserContext.username() : operatorName);

        boolean success = trackingService.updateById(tracking);

        log.info("裁剪工序跟踪强制更新：菲号={}, 操作人={}, 金额={}",
                tracking.getBundleNo(), operatorName, tracking.getSettlementAmount());

        return success;
    }

    /**
     * 管理员重置扫码记录（允许重新扫码）
     *
     * @param trackingId 跟踪记录ID
     * @param resetReason 重置原因
     * @return 重置成功返回true
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean resetScanRecord(String trackingId, String resetReason) {
        ProductionProcessTracking tracking = trackingService.getById(trackingId);

        if (tracking == null) {
            throw new BusinessException("跟踪记录不存在：" + trackingId);
        }

        if (tracking.getIsSettled()) {
            throw new BusinessException("该记录已结算，不能重置");
        }

        // ⚠️ 用 LambdaUpdateWrapper 显式 SET NULL（updateById 默认跳过 null 字段）
        LambdaUpdateWrapper<ProductionProcessTracking> resetUw = new LambdaUpdateWrapper<>();
        resetUw.eq(ProductionProcessTracking::getId, tracking.getId())
               .set(ProductionProcessTracking::getScanStatus, "reset")
               .set(ProductionProcessTracking::getScanTime, null)
               .set(ProductionProcessTracking::getScanRecordId, null)
               .set(ProductionProcessTracking::getOperatorId, null)
               .set(ProductionProcessTracking::getOperatorName, null)
               .set(ProductionProcessTracking::getSettlementAmount, null)
               .set(ProductionProcessTracking::getUpdater,
                       UserContext.username() != null ? UserContext.username() : "system");

        boolean success = trackingService.update(resetUw);

        log.info("管理员重置扫码记录：ID={}, 菲号={}, 工序={}, 原操作人={}, 原因={}",
                trackingId, tracking.getBundleNo(), tracking.getProcessName(),
                tracking.getOperatorName(), resetReason);

        return success;
    }

    // ========== 委托方法：价格同步与查询 ==========

    /**
     * 查询订单的工序跟踪记录（PC端弹窗显示）
     * 委托给 {@link TrackingPriceSyncHelper#getTrackingRecords}
     */
    public List<ProductionProcessTracking> getTrackingRecords(String productionOrderId) {
        return priceSyncHelper.getTrackingRecords(productionOrderId);
    }

    /**
     * 同步工序单价到跟踪记录（工序配置变更时调用）
     * 委托给 {@link TrackingPriceSyncHelper#syncUnitPrices}
     */
    @Transactional(rollbackFor = Exception.class)
    public int syncUnitPrices(String productionOrderId) {
        return priceSyncHelper.syncUnitPrices(productionOrderId);
    }

    /**
     * 批量同步所有订单的工序跟踪单价
     * 委托给 {@link TrackingPriceBatchHelper#syncAllOrderTrackingPrices}
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> syncAllOrderTrackingPrices() {
        return priceBatchHelper.syncAllOrderTrackingPrices();
    }

    /**
     * 批量刷新所有订单的 progressWorkflowJson 中的工序单价
     * 委托给 {@link TrackingPriceBatchHelper#refreshWorkflowPrices}
     */
    public Map<String, Object> refreshWorkflowPrices() {
        return priceBatchHelper.refreshWorkflowPrices();
    }

    /**
     * 补齐历史漏更新的入库工序跟踪记录
     * 委托给 {@link TrackingPriceBatchHelper#repairWarehousingTracking}
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> repairWarehousingTracking(String orderId) {
        return priceBatchHelper.repairWarehousingTracking(orderId);
    }

    // ========== 裁剪回滚清理 ==========

    /**
     * 裁剪任务撤回时清空该订单所有工序跟踪记录（供 CuttingTaskServiceImpl.rollbackTask 调用）
     *
     * @param productionOrderNo 订单号（如 PO20260304001），使用 VARCHAR 列查询，避免 BIGINT 类型转换问题
     */
    public int clearTrackingForRollback(String productionOrderNo) {
        if (!org.springframework.util.StringUtils.hasText(productionOrderNo)) return 0;
        int count = trackingService.deleteByOrderNo(productionOrderNo);
        log.info("[CuttingRollback] 删除工序跟踪记录 {} 条，订单号={}", count, productionOrderNo);
        return count;
    }

    @Transactional(rollbackFor = Exception.class)
    public void createWarehousingTrackingOnScan(
            CuttingBundle bundle,
            com.fashion.supplychain.production.entity.ProductionOrder order,
            String operatorId, String operatorName, String scanRecordId) {
        try {
            List<CuttingBundle> bundles = java.util.Collections.singletonList(bundle);
            appendProcessTracking(String.valueOf(order.getId()), bundles);
            log.info("[入库跟踪] 自动创建入库工序跟踪: bundleId={}, orderId={}", bundle.getId(), order.getId());
        } catch (Exception e) {
            log.warn("[入库跟踪] 创建失败: bundleId={}, orderId={}, msg={}", bundle.getId(), order.getId(), e.getMessage());
        }
    }

    private String resolveProgressStage(String processCode, String processName) {
        if (processName != null) {
            String resolved = parentNodeResolver.resolveParentForAggregation(processName.trim());
            if (resolved != null) return resolved;
        }
        if (processCode != null) {
            String resolved = parentNodeResolver.resolveParentForAggregation(processCode.trim());
            if (resolved != null) return resolved;
        }
        return "其他";
    }

    public List<Map<String, Object>> getProcessSummary(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<ProductionProcessTracking> wrapper = new LambdaQueryWrapper<>();
        if (tenantId != null) {
            wrapper.eq(ProductionProcessTracking::getTenantId, tenantId);
        }
        if (params != null && params.containsKey("orderNo")) {
            String orderNo = (String) params.get("orderNo");
            if (orderNo != null && !orderNo.isEmpty()) {
                wrapper.eq(ProductionProcessTracking::getProductionOrderNo, orderNo);
            }
        }
        List<ProductionProcessTracking> all = trackingService.list(wrapper);
        Map<String, List<ProductionProcessTracking>> grouped = all.stream()
                .collect(Collectors.groupingBy(t -> t.getProcessName() == null ? "未知" : t.getProcessName()));
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, List<ProductionProcessTracking>> entry : grouped.entrySet()) {
            List<ProductionProcessTracking> records = entry.getValue();
            int total = records.size();
            int scanned = (int) records.stream().filter(r -> "scanned".equals(r.getScanStatus())).count();
            int pending = (int) records.stream().filter(r -> "pending".equals(r.getScanStatus())).count();
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("processName", entry.getKey());
            item.put("totalRecords", total);
            item.put("scannedRecords", scanned);
            item.put("pendingRecords", pending);
            item.put("completionRate", total > 0 ? (int) Math.round(scanned * 100.0 / total) : 0);
            Set<String> orderNos = records.stream()
                    .map(ProductionProcessTracking::getProductionOrderNo)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
            item.put("orderCount", orderNos.size());
            item.put("progressStage", resolveProgressStage(
                    records.get(0).getProcessCode(), records.get(0).getProcessName()));
            result.add(item);
        }
        result.sort((a, b) -> Integer.compare((Integer) b.get("totalRecords"), (Integer) a.get("totalRecords")));
        return result;
    }

    public List<Map<String, Object>> getNodeStats(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<ProductionProcessTracking> wrapper = new LambdaQueryWrapper<>();
        if (tenantId != null) {
            wrapper.eq(ProductionProcessTracking::getTenantId, tenantId);
        }
        if (params != null && params.containsKey("orderNo")) {
            String orderNo = (String) params.get("orderNo");
            if (orderNo != null && !orderNo.isEmpty()) {
                wrapper.eq(ProductionProcessTracking::getProductionOrderNo, orderNo);
            }
        }
        List<ProductionProcessTracking> all = trackingService.list(wrapper);
        Map<String, List<ProductionProcessTracking>> grouped = all.stream()
                .collect(Collectors.groupingBy(t -> resolveProgressStage(t.getProcessCode(), t.getProcessName())));
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, List<ProductionProcessTracking>> entry : grouped.entrySet()) {
            List<ProductionProcessTracking> records = entry.getValue();
            int total = records.size();
            int scanned = (int) records.stream().filter(r -> "scanned".equals(r.getScanStatus())).count();
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("stageName", entry.getKey());
            item.put("totalRecords", total);
            item.put("scannedRecords", scanned);
            item.put("pendingRecords", total - scanned);
            item.put("completionRate", total > 0 ? (int) Math.round(scanned * 100.0 / total) : 0);
            Map<String, Integer> processBreakdown = records.stream()
                    .collect(Collectors.groupingBy(r -> r.getProcessName() == null ? "未知" : r.getProcessName(),
                            Collectors.collectingAndThen(Collectors.counting(), Long::intValue)));
            item.put("processBreakdown", processBreakdown);
            result.add(item);
        }
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> qualityInspect(Map<String, Object> params) {
        String trackingId = (String) params.get("trackingId");
        if (trackingId == null || trackingId.isEmpty()) {
            throw new BusinessException("trackingId 不能为空");
        }

        ProductionProcessTracking tracking = trackingService.getById(trackingId);
        if (tracking == null) {
            throw new BusinessException("跟踪记录不存在");
        }

        if (!"scanned".equals(tracking.getScanStatus())) {
            throw new BusinessException("该菲号工序尚未扫码完成，无法质检");
        }

        if ("qualified".equals(tracking.getQualityStatus())) {
            throw new BusinessException("该菲号工序已质检合格，无需重复质检");
        }

        int defectQty = 0;
        Object defectQtyObj = params.get("defectQuantity");
        if (defectQtyObj != null) {
            defectQty = Integer.parseInt(String.valueOf(defectQtyObj));
        }
        int qualifiedQty = (tracking.getQuantity() != null ? tracking.getQuantity() : 0) - defectQty;
        if (qualifiedQty < 0) {
            throw new BusinessException("次品数量不能超过菲号总数量(" + tracking.getQuantity() + ")");
        }

        String defectCategory = (String) params.get("defectCategory");
        String defectRemark = (String) params.get("defectRemark");
        String qualityRemark = (String) params.get("qualityRemark");
        boolean lockBundle = Boolean.TRUE.equals(params.get("lockBundle"));

        Object defectProblemsObj = params.get("defectProblems");
        String defectProblemsJson = null;
        if (defectProblemsObj instanceof java.util.List) {
            try {
                defectProblemsJson = new com.fasterxml.jackson.databind.ObjectMapper()
                        .writeValueAsString(defectProblemsObj);
            } catch (Exception e) {
                defectProblemsJson = null;
            }
        } else if (defectProblemsObj instanceof String) {
            defectProblemsJson = (String) defectProblemsObj;
        }

        String qualityStatus = defectQty > 0 ? "unqualified" : "qualified";
        String operatorId = UserContext.userId() != null ? String.valueOf(UserContext.userId()) : null;
        String operatorName = UserContext.username() != null ? UserContext.username() : "system";

        LambdaUpdateWrapper<ProductionProcessTracking> uw = new LambdaUpdateWrapper<>();
        uw.eq(ProductionProcessTracking::getId, trackingId)
                .set(ProductionProcessTracking::getQualityStatus, qualityStatus)
                .set(ProductionProcessTracking::getDefectQuantity, defectQty)
                .set(ProductionProcessTracking::getDefectCategory, defectCategory)
                .set(ProductionProcessTracking::getDefectRemark, defectRemark)
                .set(ProductionProcessTracking::getDefectProblems, defectProblemsJson)
                .set(ProductionProcessTracking::getQualityOperatorId, operatorId)
                .set(ProductionProcessTracking::getQualityOperatorName, operatorName)
                .set(ProductionProcessTracking::getQualityTime, LocalDateTime.now())
                .set(ProductionProcessTracking::getRepairStatus, defectQty > 0 ? "pending" : null)
                .set(ProductionProcessTracking::getUpdater, operatorName);
        trackingService.update(uw);

        if (defectQty > 0 && lockBundle && tracking.getCuttingBundleId() != null) {
            CuttingBundle bundle = cuttingBundleService.getById(tracking.getCuttingBundleId());
            if (bundle != null && !Boolean.TRUE.equals(bundle.getScanBlocked())) {
                bundle.setScanBlocked(true);
                cuttingBundleService.updateById(bundle);
                log.info("[工序质检-锁定] bundleId={}, bundleNo={}, trackingId={}, defectQty={}",
                        bundle.getId(), bundle.getBundleNo(), trackingId, defectQty);
            }
        }

        if (defectQty > 0 && tracking.getCuttingBundleId() != null) {
            CuttingBundle bundle = cuttingBundleService.getById(tracking.getCuttingBundleId());
            if (bundle != null && !"unqualified".equals(bundle.getStatus())) {
                bundle.setStatus("unqualified");
                cuttingBundleService.updateById(bundle);
            }
        }

        log.info("[工序质检] trackingId={}, 菲号={}, 工序={}, 质检结果={}, 次品数={}, 锁定={}",
                trackingId, tracking.getBundleNo(), tracking.getProcessName(),
                qualityStatus, defectQty, lockBundle);

        if (tracking.getProductionOrderNo() != null) {
            try {
                OrderRemark remark = new OrderRemark();
                remark.setTargetType("order");
                remark.setTargetNo(tracking.getProductionOrderNo());
                remark.setAuthorId(operatorId);
                remark.setAuthorName(operatorName);
                remark.setAuthorRole("工序质检");
                if (defectQty > 0) {
                    String categoryLabel = defectCategory != null ? defectCategory : "未分类";
                    String problemsStr = "";
                    if (defectProblemsJson != null && !defectProblemsJson.isEmpty()) {
                        try {
                            java.util.List<String> problems = new com.fasterxml.jackson.databind.ObjectMapper()
                                    .readValue(defectProblemsJson, java.util.List.class);
                            problemsStr = String.join("、", problems);
                        } catch (Exception ignored) {}
                    }
                    String remarkContent = String.format("[质检不合格] 菲号#%d %s: 次品%d件(总%d件), 缺陷: %s",
                            tracking.getBundleNo(), tracking.getProcessName(),
                            defectQty, tracking.getQuantity(), categoryLabel);
                    if (!problemsStr.isEmpty()) {
                        remarkContent += " — " + problemsStr;
                    }
                    if (defectRemark != null && !defectRemark.isEmpty()) {
                        remarkContent += " - " + defectRemark;
                    }
                    if (qualityRemark != null && !qualityRemark.isEmpty()) {
                        remarkContent += " | " + qualityRemark;
                    }
                    if (lockBundle) {
                        remarkContent += " [已锁定菲号]";
                    }
                    remark.setContent(remarkContent);
                } else {
                    String remarkContent = String.format("[质检合格] 菲号#%d %s: %d件全部合格",
                            tracking.getBundleNo(), tracking.getProcessName(), tracking.getQuantity());
                    if (qualityRemark != null && !qualityRemark.isEmpty()) {
                        remarkContent += " — " + qualityRemark;
                    }
                    remark.setContent(remarkContent);
                }
                remark.setTenantId(tracking.getTenantId());
                orderRemarkService.save(remark);
            } catch (Exception e) {
                log.warn("[工序质检] 同步备注到订单失败: {}", e.getMessage());
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("trackingId", trackingId);
        result.put("qualityStatus", qualityStatus);
        result.put("defectQuantity", defectQty);
        result.put("locked", defectQty > 0 && lockBundle);
        result.put("message", defectQty > 0
                ? (lockBundle ? "质检不合格，已录入次品并锁定菲号" : "质检不合格，已录入次品")
                : "质检合格");
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> batchQualityPass(Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<String> trackingIds = (List<String>) params.get("trackingIds");
        if (trackingIds == null || trackingIds.isEmpty()) {
            throw new BusinessException("请选择至少一条记录");
        }

        String operatorId = UserContext.userId() != null ? String.valueOf(UserContext.userId()) : null;
        String operatorName = UserContext.username() != null ? UserContext.username() : "system";
        int successCount = 0;
        int skipCount = 0;
        List<String> errors = new ArrayList<>();

        for (String trackingId : trackingIds) {
            try {
                ProductionProcessTracking tracking = trackingService.getById(trackingId);
                if (tracking == null) {
                    errors.add("记录不存在: " + trackingId);
                    continue;
                }
                if (!"scanned".equals(tracking.getScanStatus())) {
                    skipCount++;
                    continue;
                }
                if ("qualified".equals(tracking.getQualityStatus())) {
                    skipCount++;
                    continue;
                }

                LambdaUpdateWrapper<ProductionProcessTracking> uw = new LambdaUpdateWrapper<>();
                uw.eq(ProductionProcessTracking::getId, trackingId)
                        .set(ProductionProcessTracking::getQualityStatus, "qualified")
                        .set(ProductionProcessTracking::getDefectQuantity, 0)
                        .set(ProductionProcessTracking::getQualityOperatorId, operatorId)
                        .set(ProductionProcessTracking::getQualityOperatorName, operatorName)
                        .set(ProductionProcessTracking::getQualityTime, LocalDateTime.now())
                        .set(ProductionProcessTracking::getUpdater, operatorName);
                trackingService.update(uw);

                if (tracking.getProductionOrderNo() != null) {
                    try {
                        OrderRemark remark = new OrderRemark();
                        remark.setTargetType("order");
                        remark.setTargetNo(tracking.getProductionOrderNo());
                        remark.setAuthorId(operatorId);
                        remark.setAuthorName(operatorName);
                        remark.setAuthorRole("工序质检");
                        remark.setContent(String.format("[质检合格] 菲号#%d %s: %d件全部合格(批量质检)",
                                tracking.getBundleNo(), tracking.getProcessName(), tracking.getQuantity()));
                        remark.setTenantId(tracking.getTenantId());
                        orderRemarkService.save(remark);
                    } catch (Exception e) {
                        log.warn("[批量质检] 同步备注失败: {}", e.getMessage());
                    }
                }

                successCount++;
            } catch (Exception e) {
                errors.add(trackingId + ": " + e.getMessage());
            }
        }

        log.info("[批量质检合格] 总数={}, 成功={}, 跳过={}, 失败={}", trackingIds.size(), successCount, skipCount, errors.size());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", trackingIds.size());
        result.put("success", successCount);
        result.put("skipped", skipCount);
        result.put("errors", errors);
        result.put("message", String.format("批量质检完成: %d条合格, %d条跳过", successCount, skipCount));
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean lockBundle(String trackingId) {
        ProductionProcessTracking tracking = trackingService.getById(trackingId);
        if (tracking == null) {
            throw new BusinessException("跟踪记录不存在");
        }
        if (!"unqualified".equals(tracking.getQualityStatus())) {
            throw new BusinessException("只有质检不合格的菲号才能锁定");
        }
        if (tracking.getCuttingBundleId() == null) {
            throw new BusinessException("该记录无关联菲号");
        }

        CuttingBundle bundle = cuttingBundleService.getById(tracking.getCuttingBundleId());
        if (bundle == null) {
            throw new BusinessException("菲号不存在");
        }
        if (Boolean.TRUE.equals(bundle.getScanBlocked())) {
            return true;
        }

        bundle.setScanBlocked(true);
        cuttingBundleService.updateById(bundle);
        log.info("[锁定菲号] bundleId={}, bundleNo={}, operator={}",
                bundle.getId(), bundle.getBundleNo(), UserContext.username());
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean unlockBundle(String trackingId) {
        ProductionProcessTracking tracking = trackingService.getById(trackingId);
        if (tracking == null) {
            throw new BusinessException("跟踪记录不存在");
        }
        if (tracking.getCuttingBundleId() == null) {
            throw new BusinessException("该记录无关联菲号");
        }

        if (!"repair_done".equals(tracking.getRepairStatus()) && !"unqualified".equals(tracking.getQualityStatus())) {
            throw new BusinessException("只有返修完成的菲号才能解锁");
        }

        CuttingBundle bundle = cuttingBundleService.getById(tracking.getCuttingBundleId());
        if (bundle == null) {
            throw new BusinessException("菲号不存在");
        }

        bundle.setScanBlocked(false);
        if ("unqualified".equals(bundle.getStatus()) || "repaired_waiting_qc".equals(bundle.getStatus())) {
            bundle.setStatus("qualified");
        }
        cuttingBundleService.updateById(bundle);

        LambdaUpdateWrapper<ProductionProcessTracking> uw = new LambdaUpdateWrapper<>();
        uw.eq(ProductionProcessTracking::getId, trackingId)
                .set(ProductionProcessTracking::getRepairStatus, "completed")
                .set(ProductionProcessTracking::getRepairCompletedTime, LocalDateTime.now())
                .set(ProductionProcessTracking::getQualityStatus, "qualified")
                .set(ProductionProcessTracking::getUpdater, UserContext.username() != null ? UserContext.username() : "system");
        trackingService.update(uw);

        log.info("[解锁菲号] bundleId={}, bundleNo={}, operator={}",
                bundle.getId(), bundle.getBundleNo(), UserContext.username());

        if (tracking.getProductionOrderNo() != null) {
            try {
                OrderRemark remark = new OrderRemark();
                remark.setTargetType("order");
                remark.setTargetNo(tracking.getProductionOrderNo());
                remark.setAuthorId(UserContext.userId() != null ? String.valueOf(UserContext.userId()) : null);
                remark.setAuthorName(UserContext.username() != null ? UserContext.username() : "system");
                remark.setAuthorRole("工序质检");
                remark.setContent(String.format("[返修验收通过] 菲号#%d %s: 返修完成，已解锁恢复扫码",
                        tracking.getBundleNo(), tracking.getProcessName()));
                remark.setTenantId(tracking.getTenantId());
                orderRemarkService.save(remark);
            } catch (Exception e) {
                log.warn("[解锁菲号] 同步备注到订单失败: {}", e.getMessage());
            }
        }

        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean repairComplete(String trackingId) {
        ProductionProcessTracking tracking = trackingService.getById(trackingId);
        if (tracking == null) {
            throw new BusinessException("跟踪记录不存在");
        }
        if (!"unqualified".equals(tracking.getQualityStatus())) {
            throw new BusinessException("只有质检不合格的记录才能标记返修完成");
        }
        if (!"pending".equals(tracking.getRepairStatus()) && !"repairing".equals(tracking.getRepairStatus())) {
            if (tracking.getRepairStatus() == null) {
                LambdaUpdateWrapper<ProductionProcessTracking> uw = new LambdaUpdateWrapper<>();
                uw.eq(ProductionProcessTracking::getId, trackingId)
                        .set(ProductionProcessTracking::getRepairStatus, "repairing");
                trackingService.update(uw);
            }
        }

        if (tracking.getCuttingBundleId() != null) {
            try {
                repairHelper.completeBundleRepair(tracking.getCuttingBundleId());
            } catch (Exception e) {
                log.warn("[返修完成] 调用repairHelper失败，手动更新: bundleId={}, msg={}",
                        tracking.getCuttingBundleId(), e.getMessage());
                CuttingBundle bundle = cuttingBundleService.getById(tracking.getCuttingBundleId());
                if (bundle != null) {
                    bundle.setStatus("repaired_waiting_qc");
                    cuttingBundleService.updateById(bundle);
                }
            }
        }

        LambdaUpdateWrapper<ProductionProcessTracking> uw = new LambdaUpdateWrapper<>();
        uw.eq(ProductionProcessTracking::getId, trackingId)
                .set(ProductionProcessTracking::getRepairStatus, "repair_done")
                .set(ProductionProcessTracking::getRepairCompletedTime, LocalDateTime.now())
                .set(ProductionProcessTracking::getUpdater, UserContext.username() != null ? UserContext.username() : "system");
        trackingService.update(uw);

        log.info("[返修完成] trackingId={}, 菲号={}, 工序={}, operator={}",
                trackingId, tracking.getBundleNo(), tracking.getProcessName(), UserContext.username());

        if (tracking.getProductionOrderNo() != null) {
            try {
                OrderRemark remark = new OrderRemark();
                remark.setTargetType("order");
                remark.setTargetNo(tracking.getProductionOrderNo());
                remark.setAuthorId(UserContext.userId() != null ? String.valueOf(UserContext.userId()) : null);
                remark.setAuthorName(UserContext.username() != null ? UserContext.username() : "system");
                remark.setAuthorRole("工序质检");
                remark.setContent(String.format("[返修完成] 菲号#%d %s: 返修已完成，等待复检",
                        tracking.getBundleNo(), tracking.getProcessName()));
                remark.setTenantId(tracking.getTenantId());
                orderRemarkService.save(remark);
            } catch (Exception e) {
                log.warn("[返修完成] 同步备注到订单失败: {}", e.getMessage());
            }
        }

        return true;
    }
}
