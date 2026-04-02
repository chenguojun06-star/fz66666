package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.helper.InventoryValidator;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.SKUService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.impl.ProductWarehousingHelper;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fashion.supplychain.intelligence.service.WxAlertNotifyService;
import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 质检扫码执行器
 * 职责：
 * 1. 质检领取（receive）
 * 2. 质检验收（confirm）- 记录合格/次品数量，不入库
 * 3. 返修处理
 *
 * 提取自 ScanRecordOrchestrator（减少约300行代码）
 */
@Component
@Slf4j
public class QualityScanExecutor {

    @Autowired
    private ProductionScanStageSupport stageSupport;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private InventoryValidator inventoryValidator;

    @Autowired
    private SKUService skuService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Autowired
    private ProductWarehousingHelper warehousingHelper;

    @Autowired(required = false)
    private WxAlertNotifyService wxAlertNotifyService;

    @Autowired
    private ProductionOrderService productionOrderService;

    /**
     * 执行质检扫码
     */
    public Map<String, Object> execute(Map<String, Object> params, String requestId, String operatorId,
                                       String operatorName, ProductionOrder order,
                                       java.util.function.Function<String, String> colorResolver,
                                       java.util.function.Function<String, String> sizeResolver) {
        Integer qty = NumberUtils.toInt(params.get("quantity"));
        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("数量必须大于0");
        }

        String scanCode = TextUtils.safeText(params.get("scanCode"));
        if (!hasText(scanCode)) {
            throw new IllegalArgumentException("扫码内容不能为空");
        }

        CuttingBundle bundle = cuttingBundleService.getByQrCode(scanCode);
        // ★ 回退：通过 orderNo + bundleNo（整数序号）查找，对中文编码完全免疫
        // 根因：QR码含中文时 getByQrCode 可能因编码不一致匹配失败，导致 cutting_bundle_no=NULL
        if (bundle == null || !hasText(bundle.getId())) {
            String fallbackOrderNo = TextUtils.safeText(params.get("orderNo"));
            Integer bundleNoInt = NumberUtils.toInt(params.get("bundleNo"));
            if (hasText(fallbackOrderNo) && bundleNoInt != null && bundleNoInt > 0) {
                try {
                    CuttingBundle foundByNo = cuttingBundleService.getByBundleNo(fallbackOrderNo, bundleNoInt);
                    if (foundByNo != null && hasText(foundByNo.getId())) {
                        bundle = foundByNo;
                        log.info("质检回退（orderNo+bundleNo）找到菲号: orderNo={}, bundleNo={}, bundleId={}",
                                fallbackOrderNo, bundleNoInt, bundle.getId());
                    }
                } catch (Exception e) {
                    log.warn("质检通过orderNo+bundleNo查找菲号失败: orderNo={}, bundleNo={}", fallbackOrderNo, bundleNoInt, e);
                }
            }
        }
        if (bundle == null || !hasText(bundle.getId())) {
            throw new IllegalStateException("未匹配到菲号");
        }

        if (order == null) {
            throw new IllegalStateException("未匹配到订单");
        }

        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equalsIgnoreCase(st)) {
            throw new IllegalStateException("进度节点已完成，该订单已结束质检");
        }

        inventoryValidator.validateNotExceedOrderQuantity(order, "quality", "质检", qty, bundle);

        // ★ 生产前置校验：车缝 + 尾部父节点下所有子工序都有归属人才能质检
        validateProductionPrerequisite(order, bundle);

        String qualityStage = parseQualityStageFromParams(params);

        // 领取或验收阶段
        Map<String, Object> result;
        if (!"confirm".equals(qualityStage)) {
            result = handleReceiveOrInspect(params, requestId, operatorId, operatorName, order, bundle, qty,
                                         qualityStage, colorResolver, sizeResolver);
        } else {
            // 确认阶段（只录入质检结果，不入库）
            result = handleConfirm(params, requestId, operatorId, operatorName, order, bundle, qty, colorResolver, sizeResolver);
        }

        // 异步重新计算订单进度，使手机端 productionProgress 随质检进度实时更新
        try {
            if (productionOrderService != null) {
                productionOrderService.recomputeProgressAsync(order.getId());
            }
        } catch (Exception e) {
            log.warn("质检后进度异步重新计算失败: orderId={}", order.getId(), e);
        }
        return result;
    }

    /**
     * 处理领取或验收阶段
     */
    private Map<String, Object> handleReceiveOrInspect(Map<String, Object> params, String requestId,
                                                       String operatorId, String operatorName,
                                                       ProductionOrder order, CuttingBundle bundle, int qty,
                                                       String qualityStage,
                                                       java.util.function.Function<String, String> colorResolver,
                                                       java.util.function.Function<String, String> sizeResolver) {
        String stageCode = "receive".equals(qualityStage) ? "quality_receive" : "quality_inspect";
        String stageName = "receive".equals(qualityStage) ? "质检领取" : "质检验收";

        // 检查是否已存在记录
        ScanRecord existed = findQualityStageRecord(order.getId(), bundle.getId(), stageCode);

        // ★ 返修再质检：原质检已确认（confirmTime非空）且存在待质检返修申报记录时，允许重新领取
        //   业务背景：次品→返修申报→再质检，需要新的 quality_receive 轮次
        if ("quality_receive".equals(stageCode)
                && existed != null && existed.getConfirmTime() != null
                && hasActiveRepairReturn(order.getId(), bundle.getId())) {
            log.info("[QC再检] 检测到返修待质检，允许创建新质检记录: orderId={}, bundleId={}, bundleNo={}",
                    order.getId(), bundle.getId(), bundle.getBundleNo());
            existed = null; // 强制走新建路径
        }

        if (existed != null && hasText(existed.getId())) {
            return handleExistedRecord(existed, operatorId, operatorName, qualityStage, order, bundle);
        }

        // 验收必须先领取
        if ("inspect".equals(qualityStage)) {
            validateInspectAfterReceive(order.getId(), bundle.getId(), operatorId, operatorName);
        }

        // 创建新记录（领取时写 receiveTime）
        ScanRecord sr = buildQualityRecord(params, requestId, operatorId, operatorName, order, bundle,
                                          qty, stageCode, stageName, colorResolver, sizeResolver);
        sr.setReceiveTime(LocalDateTime.now());
        try {
            scanRecordService.saveScanRecord(sr);
        } catch (org.springframework.dao.DuplicateKeyException dke) {
            log.info("[QualityScan] 质检扫码记录重复（幂等）: bundleId={}, stageCode={}",
                    bundle.getId(), stageCode);
            // 幂等：记录已存在，视为此次扫码已成功完成
        } catch (Exception e) {
            log.warn("[QualityScan] 扫码记录保存失败（不阻断质检）: bundleId={}, stageCode={}, error={}",
                    bundle.getId(), stageCode, e.getMessage(), e);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "receive".equals(qualityStage) ? "领取成功" : "验收成功");
        result.put("scanRecord", sr);
        result.put("orderInfo", buildOrderInfo(order));
        result.put("cuttingBundle", bundle);
        return result;
    }

    /**
     * 处理确认阶段（只录入质检结果，不触发入库）
     * 业务说明：质检结果录入后，还需经过包装工序（双端均有记录），最终由 WarehouseScanExecutor 独立入库
     */
    private Map<String, Object> handleConfirm(Map<String, Object> params, String requestId,
                                              String operatorId, String operatorName,
                                              ProductionOrder order, CuttingBundle bundle, int qty,
                                              java.util.function.Function<String, String> colorResolver,
                                              java.util.function.Function<String, String> sizeResolver) {
        // 查找领取记录
        ScanRecord existed = findQualityStageRecord(order.getId(), bundle.getId(), "quality_receive");
        if (existed == null || !hasText(existed.getId())) {
            throw new IllegalStateException("请先领取质检任务");
        }
        // 已录入则直接返回
        if (existed.getConfirmTime() != null) {
            Map<String, Object> dup = new HashMap<>();
            dup.put("success", true);
            dup.put("duplicate", true);
            dup.put("message", "质检结果已录入，请进行包装工序");
            dup.put("scanRecord", existed);
            return dup;
        }

        String qualityResult = parseQualityResultFromParams(params);
        boolean isUnqualified = "unqualified".equalsIgnoreCase(qualityResult);

        // 更新已有记录，写 confirmTime
        existed.setConfirmTime(LocalDateTime.now());
        // 将质检结果存入 remark；不合格时格式：unqualified|[category]|[remark]|defectQty=N
        String defectCategory = TextUtils.safeText(params.get("defectCategory"));
        String defectRemark = TextUtils.safeText(params.get("defectRemark"));
        if (isUnqualified) {
            Integer defectQtyParam = NumberUtils.toInt(params.get("defectQuantity"));
            int defectQty = (defectQtyParam != null && defectQtyParam > 0) ? defectQtyParam : qty;
            String remarkBase = hasText(defectCategory)
                    ? "unqualified|" + defectCategory
                      + (hasText(defectRemark) ? "|" + defectRemark : "")
                      + "|defectQty=" + defectQty
                    : "unqualified|defectQty=" + defectQty;
            existed.setRemark(remarkBase);
        } else {
            existed.setRemark(qualityResult);
        }

        try {
            scanRecordService.updateById(existed);
        } catch (org.springframework.dao.DuplicateKeyException dke) {
            log.info("[QualityScan] 质检确认记录重复（幂等）: bundleId={}, recordId={}",
                    bundle.getId(), existed.getId());
            // 幂等处理：记录已存在，继续返回成功
        } catch (Exception e) {
            log.warn("[QualityScan] 质检确认记录更新失败（不阻断流程）: bundleId={}, recordId={}, error={}",
                    bundle.getId(), existed.getId(), e.getMessage(), e);
        }

        // ★ 次品处理：根据处理方式（返修/报废）创建不同类型的记录
        //   返修 → quality_scan 记录（repairPool），后续走"次品入库"→重新质检
        //   报废 → quality_scan_scrap 记录，不建返修池，不流回待质检
        boolean isScrap = "报废".equals(defectRemark);
        if (isUnqualified) {
            Integer defectQtyForRecord = NumberUtils.toInt(params.get("defectQuantity"));
            int dq = (defectQtyForRecord != null && defectQtyForRecord > 0) ? defectQtyForRecord : qty;
            if (isScrap) {
                createScrapRecord(order, bundle, dq, operatorId, operatorName);
            } else {
                createQualityScanRecord(order, bundle, dq, operatorId, operatorName);
                // ★ 质检不合格时推送通知给扫码记录人（触发次品入库）
                notifyDefectiveQuality(order, bundle, dq, operatorName, defectCategory);
            }
        }

        // 更新工序跟踪记录：质检验收时将 tracking 表中对应子工序状态置为已扫码
        // tracking 表按子工序名（如"质检"）初始化，processName 来自小程序传入参数
        try {
            String processName = TextUtils.safeText(params.get("processName"));
            if (!hasText(processName)) processName = "质检";
            processTrackingOrchestrator.updateScanRecord(
                bundle.getId(), processName, operatorId, operatorName, existed.getId());
            log.debug("质检工序跟踪已更新: bundleId={}, processName={}", bundle.getId(), processName);
        } catch (Exception e) {
            log.warn("质检工序跟踪更新失败（不影响主流程）: bundleId={}", bundle.getId(), e);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", isUnqualified
                ? (isScrap ? "已标记报废，剩余合格品可继续入库" : "不合格已录入，请安排返修")
                : "质检合格，请进行包装工序");
        result.put("scanRecord", existed);
        result.put("orderInfo", buildOrderInfo(order));
        result.put("cuttingBundle", bundle);
        return result;
    }

    /**
     * 解析质检阶段
     */
    private String parseQualityStageFromParams(Map<String, Object> params) {
        if (params == null) {
            return "confirm";
        }
        String v = TextUtils.safeText(params.get("qualityStage"));
        if (hasText(v)) {
            String s = v.trim().toLowerCase();
            if ("receive".equals(s) || "领取".equals(v.trim())) {
                return "receive";
            }
            if ("inspect".equals(s) || "验收".equals(v.trim())) {
                return "inspect";
            }
        }
        return "confirm";
    }

    /**
     * 解析质检结果
     */
    private String parseQualityResultFromParams(Map<String, Object> params) {
        if (params == null) {
            return "qualified";
        }
        String v = TextUtils.safeText(params.get("qualityResult"));
        if (hasText(v)) {
            String s = v.trim().toLowerCase();
            if ("unqualified".equals(s) || "不合格".equals(v.trim()) || "次品".equals(v.trim())) {
                return "unqualified";
            }
            if ("repaired".equals(s) || "返修".equals(v.trim()) || "已返修".equals(v.trim())) {
                return "repaired";
            }
        }
        return "qualified";
    }

    /**
     * 验证生产前置条件：车缝父节点下所有子工序都有扫码记录归属人才能质检
     * 业务规则：不管工序前后顺序，只要车缝环节里所有子工序都有归属人就可以质检
     * PC端和小程序共用此校验，确保业务逻辑一致
     */
    private void validateProductionPrerequisite(ProductionOrder order, CuttingBundle bundle) {
        if (order == null || bundle == null || !hasText(order.getId()) || !hasText(bundle.getId())) {
            return;
        }
        String orderId = order.getId();
        String bundleId = bundle.getId();
        try {
            // 1. 从工序模板获取车缝父节点下的所有子工序
            String styleNo = order.getStyleNo();
            List<String> sewingSubProcesses = resolveSewingSubProcesses(styleNo);

            if (sewingSubProcesses.isEmpty()) {
                // 模板未配置或无车缝子工序，降级为至少有1条生产记录
                long productionCount = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                        .eq(ScanRecord::getOrderId, orderId)
                        .eq(ScanRecord::getCuttingBundleId, bundleId)
                        .eq(ScanRecord::getScanType, "production")
                        .eq(ScanRecord::getScanResult, "success")
                        .isNotNull(ScanRecord::getOperatorId));
                if (productionCount <= 0) {
                    throw new IllegalStateException("温馨提示：该菲号还未完成生产扫码哦～请先完成生产工序（如车缝）后再进行质检");
                }
                return;
            }

            // 2. 检查每个车缝子工序是否都有扫码记录归属人
            List<String> missingProcesses = new ArrayList<>();
            for (String processName : sewingSubProcesses) {
                long count = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                        .eq(ScanRecord::getOrderId, orderId)
                        .eq(ScanRecord::getCuttingBundleId, bundleId)
                        .eq(ScanRecord::getScanType, "production")
                        .eq(ScanRecord::getScanResult, "success")
                        .isNotNull(ScanRecord::getOperatorId)
                        .and(w -> w
                                .eq(ScanRecord::getProcessCode, processName)
                                .or()
                                .eq(ScanRecord::getProcessName, processName)
                                .or()
                                .eq(ScanRecord::getProgressStage, processName)));
                if (count <= 0) {
                    missingProcesses.add(processName);
                }
            }

            if (!missingProcesses.isEmpty()) {
                throw new IllegalStateException(
                        "温馨提示：车缝工序还未全部完成哦～以下子工序还需要扫码：" + String.join("、", missingProcesses)
                                + "。完成这些工序后就可以进行质检啦！");
            }

            // 3. 尾部子工序全部完成校验（基于模板配置）
            // 质检在流程上位于“尾部”之后，入库之前，必须确保尾部所有子工序已完成
            stageSupport.validateParentStagePrerequisite(order, bundle, "入库", null);

        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("检查生产前置条件失败: orderId={}, bundleId={}", orderId, bundleId, e);
            // 查询异常时不阻断业务，仅记录日志
        }
    }

    /**
     * 从工序模板中解析车缝父节点下的所有子工序名称
     * 模板JSON格式：{"steps":[{"processName":"上领","progressStage":"车缝",...}]}
     */
    private List<String> resolveSewingSubProcesses(String styleNo) {
        List<String> result = new ArrayList<>();
        if (!hasText(styleNo) || templateLibraryService == null) {
            return result;
        }
        try {
            List<Map<String, Object>> nodes = templateLibraryService.resolveProgressNodeUnitPrices(styleNo);
            if (nodes == null || nodes.isEmpty()) {
                return result;
            }
            for (Map<String, Object> node : nodes) {
                if (node == null) continue;
                String progressStage = node.get("progressStage") == null ? "" : node.get("progressStage").toString().trim();
                String processName = node.get("name") == null ? "" : node.get("name").toString().trim();
                if (!hasText(processName)) continue;
                // 判断是否属于车缝父节点（使用同义词匹配）
                if (templateLibraryService.progressStageNameMatches(progressStage, "车缝")
                        || templateLibraryService.progressStageNameMatches(progressStage, "缝制")
                        || templateLibraryService.progressStageNameMatches(progressStage, "生产")) {
                    result.add(processName);
                }
            }
        } catch (Exception e) {
            log.warn("解析车缝子工序失败: styleNo={}", styleNo, e);
        }
        return result;
    }

    /**
     * 查找质检阶段记录
     */
    public ScanRecord findQualityStageRecord(String orderId, String bundleId, String processCode) {
        if (!hasText(orderId) || !hasText(bundleId) || !hasText(processCode)) {
            return null;
        }
        try {
            return scanRecordService.getOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .eq(ScanRecord::getCuttingBundleId, bundleId)
                    .eq(ScanRecord::getProcessCode, processCode)
                    .eq(ScanRecord::getScanType, "quality")
                    .eq(ScanRecord::getScanResult, "success")
                    .orderByDesc(ScanRecord::getScanTime)
                    .last("limit 1"));
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 处理已存在的记录
     */
    private Map<String, Object> handleExistedRecord(ScanRecord existed, String operatorId, String operatorName,
                                                    String qualityStage, ProductionOrder order, CuttingBundle bundle) {
        String existingOperatorId = existed.getOperatorId() == null ? null : existed.getOperatorId().trim();
        String existingOperatorName = existed.getOperatorName() == null ? null : existed.getOperatorName().trim();

        boolean isSameOperator = false;
        if (hasText(operatorId) && hasText(existingOperatorId)) {
            isSameOperator = operatorId.equals(existingOperatorId);
        } else if (hasText(operatorName) && hasText(existingOperatorName)) {
            isSameOperator = operatorName.equals(existingOperatorName);
        }

        if (!isSameOperator && "receive".equals(qualityStage)) {
            String otherName = hasText(existingOperatorName) ? existingOperatorName : "他人";
            throw new IllegalStateException("该菲号已被「" + otherName + "」领取，无法重复领取");
        }

        Map<String, Object> dup = new HashMap<>();
        dup.put("success", true);
        dup.put("message", "receive".equals(qualityStage) ? "已领取" : "已验收");
        dup.put("scanRecord", existed);
        dup.put("orderInfo", buildOrderInfo(order));
        dup.put("cuttingBundle", bundle);
        return dup;
    }

    /**
     * 验证验收必须在领取之后
     */
    private void validateInspectAfterReceive(String orderId, String bundleId, String operatorId, String operatorName) {
        ScanRecord received = findQualityStageRecord(orderId, bundleId, "quality_receive");
        if (received == null || !hasText(received.getId())) {
            throw new IllegalStateException("请先领取再验收");
        }

        String receivedOperatorId = received.getOperatorId() == null ? null : received.getOperatorId().trim();
        String receivedOperatorName = received.getOperatorName() == null ? null : received.getOperatorName().trim();

        boolean isSameOperator = false;
        if (hasText(operatorId) && hasText(receivedOperatorId)) {
            isSameOperator = operatorId.equals(receivedOperatorId);
        } else if (hasText(operatorName) && hasText(receivedOperatorName)) {
            isSameOperator = operatorName.equals(receivedOperatorName);
        }

        if (!isSameOperator) {
            String otherName = hasText(receivedOperatorName) ? receivedOperatorName : "他人";
            throw new IllegalStateException("该菲号已被「" + otherName + "」领取，只能由领取人验收");
        }
    }

    /**
     * 质检确认次品时，创建 quality_scan 类型入库记录（建立"次品池" repairPool）。
     *
     * 业务背景：
     * 菲号10件 → 质检发现2件次品 → 先正常入库8件合格品 → 剩余2件走返修→再质检→入库。
     * calcRepairBreakdown 统计 repairPool 时依赖 unqualifiedQuantity > 0 的记录，
     * 若不在此处创建，repairPool=0 → validateDefectiveReentryQty 报"无可返修入库数量"→ 400。
     *
     * warehousingType=quality_scan 不会被小程序/PC 端计入真实入库数量。
     */
    private void createQualityScanRecord(ProductionOrder order, CuttingBundle bundle,
                                         int defectQty, String operatorId, String operatorName) {
        try {
            // 幂等：同一菲号只创建一条 quality_scan 记录
            List<ProductWarehousing> existing = productWarehousingService.list(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getOrderId, order.getId())
                            .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                            .eq(ProductWarehousing::getWarehousingType, "quality_scan")
                            .eq(ProductWarehousing::getDeleteFlag, 0));
            if (existing != null && !existing.isEmpty()) {
                log.info("[QualityScan] quality_scan 记录已存在，跳过: orderId={}, bundleId={}",
                        order.getId(), bundle.getId());
                return;
            }

            LocalDateTime now = LocalDateTime.now();
            ProductWarehousing w = new ProductWarehousing();
            w.setOrderId(order.getId());
            w.setOrderNo(order.getOrderNo());
            w.setStyleId(order.getStyleId());
            w.setStyleNo(order.getStyleNo());
            w.setStyleName(order.getStyleName());
            w.setWarehousingType("quality_scan");
            w.setWarehouse("待分配");
            w.setWarehousingQuantity(0);        // 不产生库存变动
            w.setQualifiedQuantity(0);
            w.setUnqualifiedQuantity(defectQty); // ← 次品池，供 calcRepairBreakdown 使用
            w.setQualityStatus("unqualified");
            w.setCuttingBundleId(bundle.getId());
            w.setCuttingBundleNo(bundle.getBundleNo());
            w.setCuttingBundleQrCode(bundle.getQrCode());
            if (hasText(operatorId)) {
                w.setQualityOperatorId(operatorId);
            }
            if (hasText(operatorName)) {
                w.setQualityOperatorName(operatorName);
            }
            w.setCreateTime(now);
            w.setUpdateTime(now);
            w.setDeleteFlag(0);

            productWarehousingService.save(w);
            log.info("[QualityScan] 已创建 quality_scan 次品池记录: orderId={}, bundleId={}, defectQty={}",
                    order.getId(), bundle.getId(), defectQty);

            // ★ 更新菲号状态为 unqualified，阻止后续入库（必须返修后才能入库）
            syncBundleStatusAfterQualityScan(order.getId(), bundle);

        } catch (org.springframework.dao.DuplicateKeyException dke) {
            log.info("[QualityScan] quality_scan 记录重复（幂等）: orderId={}, bundleId={}",
                    order.getId(), bundle.getId());
        } catch (Exception e) {
            log.warn("[QualityScan] 创建 quality_scan 记录失败（不阻断主流程）: orderId={}, bundleId={}, error={}",
                    order.getId(), bundle.getId(), e.getMessage(), e);
        }
    }

    /**
     * 创建报废记录（quality_scan_scrap）。
     * 与返修记录的区别：warehousingType="quality_scan_scrap"，qualityStatus="scrapped"。
     * 报废记录不建返修池，不流回"待质检"状态，calcRepairBreakdown 会排除此类型。
     *
     * ★ 历史数据兼容：旧代码不区分返修/报废，全部创建 quality_scan 记录。
     *   用户选择"报废"时，先把该菲号已有的 quality_scan 转为 quality_scan_scrap，
     *   再创建新记录（幂等），最后更新菲号状态以解除入库阻止。
     */
    private void createScrapRecord(ProductionOrder order, CuttingBundle bundle,
                                   int defectQty, String operatorId, String operatorName) {
        try {
            // ★ 第一步：把该菲号所有旧 quality_scan 转为 quality_scan_scrap（历史兼容 + 用户改选）
            try {
                boolean converted = productWarehousingService.update(
                        null,
                        new LambdaUpdateWrapper<ProductWarehousing>()
                                .eq(ProductWarehousing::getOrderId, order.getId())
                                .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                                .eq(ProductWarehousing::getWarehousingType, "quality_scan")
                                .eq(ProductWarehousing::getDeleteFlag, 0)
                                .set(ProductWarehousing::getWarehousingType, "quality_scan_scrap")
                                .set(ProductWarehousing::getQualityStatus, "scrapped")
                                .set(ProductWarehousing::getWarehouse, "报废")
                                .set(ProductWarehousing::getUpdateTime, LocalDateTime.now()));
                if (converted) {
                    log.info("[QualityScan] 已将旧quality_scan转为scrap: orderId={}, bundleId={}",
                            order.getId(), bundle.getId());
                }
            } catch (Exception e) {
                log.warn("[QualityScan] 转换旧quality_scan记录失败（继续创建新记录）: orderId={}, bundleId={}",
                        order.getId(), bundle.getId(), e);
            }

            // ★ 第二步：幂等创建 scrap 记录
            List<ProductWarehousing> existing = productWarehousingService.list(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getOrderId, order.getId())
                            .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                            .eq(ProductWarehousing::getWarehousingType, "quality_scan_scrap")
                            .eq(ProductWarehousing::getDeleteFlag, 0));
            if (existing != null && !existing.isEmpty()) {
                log.info("[QualityScan] quality_scan_scrap 记录已存在（含转换），跳过新建: orderId={}, bundleId={}",
                        order.getId(), bundle.getId());
            } else {
                LocalDateTime now = LocalDateTime.now();
                ProductWarehousing w = new ProductWarehousing();
                w.setOrderId(order.getId());
                w.setOrderNo(order.getOrderNo());
                w.setStyleId(order.getStyleId());
                w.setStyleNo(order.getStyleNo());
                w.setStyleName(order.getStyleName());
                w.setWarehousingType("quality_scan_scrap");
                w.setWarehouse("报废");
                w.setWarehousingQuantity(0);
                w.setQualifiedQuantity(0);
                w.setUnqualifiedQuantity(defectQty);
                w.setQualityStatus("scrapped");
                w.setCuttingBundleId(bundle.getId());
                w.setCuttingBundleNo(bundle.getBundleNo());
                w.setCuttingBundleQrCode(bundle.getQrCode());
                if (hasText(operatorId)) {
                    w.setQualityOperatorId(operatorId);
                }
                if (hasText(operatorName)) {
                    w.setQualityOperatorName(operatorName);
                }
                w.setCreateTime(now);
                w.setUpdateTime(now);
                w.setDeleteFlag(0);

                productWarehousingService.save(w);
                log.info("[QualityScan] 已创建报废记录: orderId={}, bundleId={}, scrapQty={}",
                        order.getId(), bundle.getId(), defectQty);
            }

            // ★ 第三步：更新菲号状态（解除/保持入库阻止）
            syncBundleStatusAfterQualityScan(order.getId(), bundle);

        } catch (org.springframework.dao.DuplicateKeyException dke) {
            log.info("[QualityScan] quality_scan_scrap 记录重复（幂等）: orderId={}, bundleId={}",
                    order.getId(), bundle.getId());
        } catch (Exception e) {
            log.warn("[QualityScan] 创建报废记录失败（不阻断主流程）: orderId={}, bundleId={}, error={}",
                    order.getId(), bundle.getId(), e.getMessage(), e);
        }
    }

    /**
     * 质检扫码后同步菲号状态：
     * - repairPool > 0 且菲号未被阻止 → 设为 "unqualified"（阻止入库）
     * - repairPool == 0 且菲号处于阻止状态 → 设为 "qualified"（解除阻止，全部报废无需返修）
     * - 其他情况不变
     */
    private void syncBundleStatusAfterQualityScan(String orderId, CuttingBundle bundle) {
        try {
            int repairPool = warehousingHelper.calcRepairBreakdown(orderId, bundle.getId(), null)[0];
            boolean isCurrentlyBlocked = warehousingHelper.isBundleBlockedForWarehousing(bundle.getStatus());

            if (repairPool == 0 && isCurrentlyBlocked) {
                // 无返修池（全部报废）→ 清除阻止，合格品可正常入库
                cuttingBundleService.lambdaUpdate()
                        .eq(CuttingBundle::getId, bundle.getId())
                        .set(CuttingBundle::getStatus, "qualified")
                        .set(CuttingBundle::getUpdateTime, LocalDateTime.now())
                        .update();
                log.info("[QualityScan] 无返修池，菲号状态→qualified: bundleId={}", bundle.getId());
            } else if (repairPool > 0 && !isCurrentlyBlocked) {
                // 有返修池但未阻止 → 设为 unqualified，阻止入库
                cuttingBundleService.lambdaUpdate()
                        .eq(CuttingBundle::getId, bundle.getId())
                        .set(CuttingBundle::getStatus, "unqualified")
                        .set(CuttingBundle::getUpdateTime, LocalDateTime.now())
                        .update();
                log.info("[QualityScan] 有返修池，菲号状态→unqualified: bundleId={}", bundle.getId());
            }
            // else: 状态已匹配，无需更新
        } catch (Exception e) {
            log.warn("[QualityScan] 同步菲号状态失败（不阻断流程）: bundleId={}", bundle.getId(), e);
        }
    }

    /**
     * 验证不重复入库
     */
    private void validateNotDuplicateWarehousing(String orderId, String bundleId, boolean isUnqualified) {
        try {
            List<ProductWarehousing> existingList = productWarehousingService.list(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .select(ProductWarehousing::getId, ProductWarehousing::getQualityStatus,
                                    ProductWarehousing::getWarehousingQuantity,
                                    ProductWarehousing::getQualifiedQuantity,
                                    ProductWarehousing::getUnqualifiedQuantity)
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .eq(ProductWarehousing::getOrderId, orderId)
                            .eq(ProductWarehousing::getCuttingBundleId, bundleId)
                            .orderByDesc(ProductWarehousing::getCreateTime));

            if (existingList != null) {
                for (ProductWarehousing w : existingList) {
                    if (w == null) continue;

                    int totalQty = w.getWarehousingQuantity() == null
                            ? (w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity())
                              + (w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity())
                            : w.getWarehousingQuantity();
                    if (totalQty <= 0) continue;

                    String qs = TextUtils.safeText(w.getQualityStatus());
                    if (!hasText(qs) || "qualified".equalsIgnoreCase(qs)) {
                        throw new IllegalStateException("该菲号已质检合格，不能重复扫码");
                    }
                    if (isUnqualified && "unqualified".equalsIgnoreCase(qs)) {
                        throw new IllegalStateException("该菲号已质检记录，不能重复扫码");
                    }
                }
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            // 检查失败不阻止流程
            log.warn("检查重复入库失败: orderId={}, bundleId={}", orderId, bundleId, e);
        }
    }

    /**
     * 计算剩余返修数量
     */
    private int computeRemainingRepairQuantity(String orderId, String bundleId, String excludeId) {
        try {
            // 1. 获取菲号原始裁剪数量
            CuttingBundle bundle = cuttingBundleService.getById(bundleId);
            if (bundle == null) {
                return 0;
            }
            int totalQty = bundle.getQuantity() != null ? bundle.getQuantity() : 0;
            if (totalQty <= 0) {
                return 0;
            }
            // 2. 统计该菲号已入库数量（排除指定记录，避免重复计算当前操作）
            LambdaQueryWrapper<ProductWarehousing> query = new LambdaQueryWrapper<ProductWarehousing>()
                    .eq(ProductWarehousing::getOrderId, orderId)
                    .eq(ProductWarehousing::getCuttingBundleId, bundleId);
            if (hasText(excludeId)) {
                query.ne(ProductWarehousing::getId, excludeId);
            }
            List<ProductWarehousing> warehousingList = productWarehousingService.list(query);
            int warehoused = warehousingList.stream()
                    .mapToInt(w -> w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0)
                    .sum();
            return Math.max(0, totalQty - warehoused);
        } catch (Exception e) {
            log.warn("计算剩余返修数量失败: orderId={}, bundleId={}", orderId, bundleId, e);
            return Integer.MAX_VALUE;
        }
    }

    /**
     * 构建质检记录
     */
    private ScanRecord buildQualityRecord(Map<String, Object> params, String requestId, String operatorId,
                                         String operatorName, ProductionOrder order, CuttingBundle bundle,
                                         int qty, String stageCode, String stageName,
                                         java.util.function.Function<String, String> colorResolver,
                                         java.util.function.Function<String, String> sizeResolver) {
        ScanRecord sr = new ScanRecord();
        sr.setRequestId(requestId);
        sr.setScanCode(TextUtils.safeText(params.get("scanCode")));
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setTenantId(order.getTenantId());
        sr.setColor(colorResolver.apply(null));
        sr.setSize(sizeResolver.apply(null));
        sr.setQuantity(qty);
        sr.setProcessCode(stageCode);
        sr.setProgressStage("质检");  // 父工序名统一用"质检"，不用 stageName("质检领取"/"质检验收")
        // processName 统一用工序模板中的名称"质检"，而非 stageName("质检领取"/"质检验收")
        // 这样小程序 _inferQualityStage 可以用 scanType=quality 匹配，processName 也一致
        sr.setProcessName("质检");
        sr.setOperatorId(operatorId);
        sr.setOperatorName(operatorName);
        sr.setScanTime(LocalDateTime.now());
        sr.setScanType("quality");
        sr.setScanResult("success");
        sr.setRemark(stageName);
        sr.setCuttingBundleId(bundle.getId());
        sr.setCuttingBundleNo(bundle.getBundleNo());
        sr.setCuttingBundleQrCode(bundle.getQrCode());

        if (skuService != null) {
            skuService.attachProcessUnitPrice(sr);
        }

        return sr;
    }

    /**
     * 查找入库生成的扫码记录
     */
    private ScanRecord findWarehousingGeneratedRecord(String warehousingId) {
        if (!hasText(warehousingId)) {
            return null;
        }
        String requestId = "WAREHOUSING:" + warehousingId.trim();
        try {
            return scanRecordService.getOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getRequestId, requestId)
                    .last("limit 1"));
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 构建订单信息
     */
    private Map<String, Object> buildOrderInfo(ProductionOrder order) {
        Map<String, Object> info = new HashMap<>();
        info.put("orderNo", order.getOrderNo());
        info.put("styleNo", order.getStyleNo());
        return info;
    }

    private boolean hasText(String str) {
        return StringUtils.hasText(str);
    }

    /**
     * 质检不合格时推送通知给扫码记录人（交付次品入库任务）
     * 推送目标：该菲号原始扫码人（scanRecordOperatorId）
     * 推送内容：菲号 + 颜色 + 尺码 + 不合格数量 + 缺陷分类
     *
     * 业务背景：质检员确认次品 → 通知扫码人 → 扫码人在小程序"我的任务"列表中看到待返修菲号 → 申报返修 → 再质检入库
     */
    private void notifyDefectiveQuality(ProductionOrder order, CuttingBundle bundle, int defectQty,
                                       String qualityOperatorName, String defectCategory) {
        try {
            if (wxAlertNotifyService == null) {
                log.debug("[质检通知] WxAlertNotifyService 未配置，跳过推送");
                return;
            }

            Long tenantId = UserContext.tenantId();
            if (tenantId == null) {
                log.warn("[质检通知] 无效租户 ID，无法推送通知");
                return;
            }

            String bundleNo = String.valueOf(bundle.getBundleNo());
            String color = hasText(bundle.getColor()) ? bundle.getColor() : "未知";
            String size = hasText(bundle.getSize()) ? bundle.getSize() : "均码";
            String categoryLabel = parseDefectCategoryLabel(defectCategory);

            String title = "菲号质检不合格";
            String content = String.format("菲号 %s（%s/%s）%d 件不合格%s，请安排返修。",
                    bundleNo, color, size, defectQty,
                    hasText(categoryLabel) ? "（" + categoryLabel + "）" : "");
            String page = "pages/warehouse/finished/details/index?bundleId=" + bundle.getId();

            wxAlertNotifyService.notifyAlert(tenantId, title, content, order.getOrderNo(), page);
            log.info("[质检通知] 菲号质检不合格推送完成: bundleNo={}, defectQty={}, category={}",
                    bundleNo, defectQty, categoryLabel);
        } catch (Exception e) {
            log.warn("[质检通知] 推送失败（不阻断主流程）: bundleId={}, error={}",
                    bundle.getId(), e.getMessage(), e);
        }
    }

    /**
     * 解析缺陷分类标签
     */
    private String parseDefectCategoryLabel(String defectCategory) {
        if (!hasText(defectCategory)) {
            return "";
        }
        return switch (defectCategory.trim().toLowerCase()) {
            case "appearance_integrity" -> "外观完整性问题";
            case "size_accuracy" -> "尺寸精度问题";
            case "process_compliance" -> "工艺规范性问题";
            case "functional_effectiveness" -> "功能有效性问题";
            case "other" -> "其他问题";
            default -> defectCategory;
        };
    }

    /**
     * 检查是否存在待质检的返修申报记录（warehousingType=repair_return）
     * 用于判断质检员是否需要为修好的次品进行再次验收
     */
    private boolean hasActiveRepairReturn(String orderId, String bundleId) {
        if (!hasText(orderId) || !hasText(bundleId)) return false;
        try {
            return productWarehousingService.lambdaQuery()
                    .eq(ProductWarehousing::getOrderId, orderId)
                    .eq(ProductWarehousing::getCuttingBundleId, bundleId)
                    .eq(ProductWarehousing::getWarehousingType, "repair_return")
                    .eq(ProductWarehousing::getDeleteFlag, 0)
                    .count() > 0;
        } catch (Exception e) {
            log.warn("[QC再检] 查询返修记录失败，默认不触发再检: orderId={}, bundleId={}", orderId, bundleId, e);
            return false;
        }
    }
}
