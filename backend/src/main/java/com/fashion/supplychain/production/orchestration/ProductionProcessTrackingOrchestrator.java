package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.helper.TrackingPriceSyncHelper;
import com.fashion.supplychain.production.helper.TrackingRecordInitHelper;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
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

    // ========== 委托方法：初始化与追加 ==========

    /**
     * 初始化工序跟踪记录（裁剪完成时调用）
     * 委托给 {@link TrackingRecordInitHelper#initializeProcessTracking}
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public int initializeProcessTracking(String productionOrderId) {
        return initHelper.initializeProcessTracking(productionOrderId);
    }

    /**
     * 追加工序跟踪记录（新增菲号时调用）
     * 委托给 {@link TrackingRecordInitHelper#appendProcessTracking}
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
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
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
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
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
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
     * 委托给 {@link TrackingPriceSyncHelper#syncAllOrderTrackingPrices}
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> syncAllOrderTrackingPrices() {
        return priceSyncHelper.syncAllOrderTrackingPrices();
    }

    /**
     * 批量刷新所有订单的 progressWorkflowJson 中的工序单价
     * 委托给 {@link TrackingPriceSyncHelper#refreshWorkflowPrices}
     */
    public Map<String, Object> refreshWorkflowPrices() {
        return priceSyncHelper.refreshWorkflowPrices();
    }

    /**
     * 补齐历史漏更新的入库工序跟踪记录
     * 委托给 {@link TrackingPriceSyncHelper#repairWarehousingTracking}
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> repairWarehousingTracking(String orderId) {
        return priceSyncHelper.repairWarehousingTracking(orderId);
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

    @Transactional(propagation = Propagation.REQUIRES_NEW)
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
}
