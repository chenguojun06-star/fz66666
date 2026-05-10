package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.helper.InventoryValidator;
import com.fashion.supplychain.production.helper.DuplicateScanPreventer;
import com.fashion.supplychain.production.helper.lookup.BundleLookupContext;
import com.fashion.supplychain.production.service.CuttingBundleLookupService;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.SKUService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fashion.supplychain.intelligence.service.WxAlertNotifyService;
import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
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
    private CuttingBundleLookupService bundleLookupService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private InventoryValidator inventoryValidator;

    @Autowired
    private DuplicateScanPreventer duplicateScanPreventer;

    @Autowired
    private SKUService skuService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Autowired(required = false)
    private WxAlertNotifyService wxAlertNotifyService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private QualityScanRecordFactory recordFactory;

    @Autowired
    private QualityScanValidator validator;

    @Autowired
    private ScanExecutorSupport executorSupport;

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

        // 提前解析 qualityStage，用于决定是否跳过防重复检查：
        // confirm 阶段紧跟 receive 是合法的两步操作，不应被 30 秒防重复窗口拦截；
        // receive / inspect 仍保留防重复保护，防止意外双击。
        String qualityStage = parseQualityStageFromParams(params);
        if (!"confirm".equals(qualityStage)) {
            if (duplicateScanPreventer.hasRecentDuplicateScan(scanCode, "quality", qty, null)) {
                throw new IllegalStateException("操作过快，请稍后再试（防重复扫码保护）");
            }
        }

        CuttingBundle bundle = bundleLookupService.lookup(BundleLookupContext.from(params));
        if (bundle == null || !hasText(bundle.getId())) {
            throw new IllegalStateException("未匹配到菲号");
        }

        executorSupport.validateBundleFactoryAccess(bundle, "质检");

        executorSupport.validateBundleNotBlocked(bundle, "质检");

        if (order == null) {
            throw new IllegalStateException("未匹配到订单");
        }

        executorSupport.validateOrderNotTerminal(order, "质检");

        validator.validateNotAlreadyQualityCheckedByPc(order.getId(), bundle.getId());

        // 质检确认阶段只更新已有领取记录（写 confirmTime + 质检结果），不新增扫码数量，
        // 因此跳过数量校验；否则 receive 记录的 quantity 会被重复计入 completedQty，
        // 导致 "扫码数量超出裁剪数量限制" 误报（尤其单菲号订单必现）。
        if (!"confirm".equals(qualityStage)) {
            inventoryValidator.validateNotExceedOrderQuantity(order, "quality", "质检", qty, bundle);
        }

        // ★ 生产前置校验：车缝 + 尾部父节点下所有子工序都有归属人才能质检
        validator.validateProductionPrerequisite(order, bundle);

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
        executorSupport.recomputeProgressAsync(order.getId());

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
            validator.validateInspectAfterReceive(order.getId(), bundle.getId(), operatorId, operatorName,
                    processCode -> findQualityStageRecord(order.getId(), bundle.getId(), processCode));
        }

        ScanRecord sr = recordFactory.buildQualityRecord(params, requestId, operatorId, operatorName, order, bundle,
                                          qty, stageCode, stageName, colorResolver, sizeResolver);
        sr.setReceiveTime(LocalDateTime.now());
        try {
            scanRecordService.saveScanRecord(sr);
        } catch (org.springframework.dao.DuplicateKeyException dke) {
            log.info("[QualityScan] 质检扫码记录重复（幂等）: bundleId={}, stageCode={}",
                    bundle.getId(), stageCode);
        } catch (Exception e) {
            throw new IllegalStateException("质检扫码记录保存失败，请重试: bundleId=" + bundle.getId(), e);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "receive".equals(qualityStage) ? "领取成功" : "验收成功");
        result.put("scanRecord", sr);
        result.put("orderInfo", recordFactory.buildOrderInfo(order));
        result.put("cuttingBundle", bundle);
        result.put("nextScanType", "warehouse");
        result.put("nextStageHint", "下一环节: warehouse");

        try {
            if (processTrackingOrchestrator != null && bundle != null && hasText(bundle.getId())) {
                processTrackingOrchestrator.updateScanRecord(
                    bundle.getId(), "质检", operatorId, operatorName, sr.getId());
            }
        } catch (Exception e) {
            log.debug("质检领取/验收工序跟踪更新失败(不阻断): bundleId={}", bundle != null ? bundle.getId() : null, e);
        }

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
        Integer defectQtyParam = NumberUtils.toInt(params.get("defectQuantity"));
        int defectQty = (defectQtyParam != null && defectQtyParam > 0) ? defectQtyParam : 0;
        if (defectQty == 0 && isUnqualified) {
            defectQty = qty;
        }

        existed.setConfirmTime(LocalDateTime.now());
        existed.setRemark(recordFactory.buildDefectRemark(params, qualityResult, isUnqualified, defectQty));

        try {
            scanRecordService.updateById(existed);
        } catch (org.springframework.dao.DuplicateKeyException dke) {
            log.info("[QualityScan] 质检确认记录重复（幂等）: bundleId={}, recordId={}",
                    bundle.getId(), existed.getId());
        } catch (Exception e) {
            throw new IllegalStateException("质检确认记录更新失败，请重试: bundleId=" + bundle.getId(), e);
        }

        boolean isScrap = "报废".equals(TextUtils.safeText(params.get("defectRemark")));
        if (isUnqualified) {
            if (isScrap) {
                recordFactory.createScrapRecord(order, bundle, defectQty, operatorId, operatorName);
            } else {
                recordFactory.createQualityScanRecord(order, bundle, defectQty, operatorId, operatorName);
                notifyDefectiveQuality(order, bundle, defectQty, operatorName,
                        TextUtils.safeText(params.get("defectCategory")));
            }
        } else {
            recordFactory.createQualifiedScanRecord(order, bundle, qty, operatorId, operatorName);
        }

        updateQualityProcessTracking(params, bundle, operatorId, operatorName, existed.getId());

        return buildConfirmResult(existed, order, bundle, isUnqualified, isScrap, operatorId, operatorName, qty);
    }

    private String buildDefectRemark(Map<String, Object> params, String qualityResult,
                                      boolean isUnqualified, int defectQty) {
        if (!isUnqualified) return qualityResult;
        String defectCategory = TextUtils.safeText(params.get("defectCategory"));
        String defectRemark = TextUtils.safeText(params.get("defectRemark"));
        return hasText(defectCategory)
                ? "unqualified|" + defectCategory
                  + (hasText(defectRemark) ? "|" + defectRemark : "")
                  + "|defectQty=" + defectQty
                : "unqualified|defectQty=" + defectQty;
    }

    private void updateQualityProcessTracking(Map<String, Object> params, CuttingBundle bundle,
                                               String operatorId, String operatorName, String recordId) {
        try {
            String processName = TextUtils.safeText(params.get("processName"));
            if (!hasText(processName)) processName = "质检";
            processTrackingOrchestrator.updateScanRecord(
                bundle.getId(), processName, operatorId, operatorName, recordId);
        } catch (Exception e) {
            log.warn("质检工序跟踪更新失败（不影响主流程）: bundleId={}", bundle.getId(), e);
        }
    }

    private Map<String, Object> buildConfirmResult(ScanRecord existed, ProductionOrder order,
                                                     CuttingBundle bundle, boolean isUnqualified,
                                                     boolean isScrap, String operatorId,
                                                     String operatorName, int qty) {
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", isUnqualified
                ? (isScrap ? "已标记报废，剩余合格品可继续入库" : "不合格已录入，请安排返修")
                : "质检合格，请进行包装工序");
        result.put("scanRecord", existed);
        result.put("orderInfo", recordFactory.buildOrderInfo(order));
        result.put("cuttingBundle", bundle);
        result.put("nextScanType", "warehouse");
        result.put("nextStageHint", "下一环节: warehouse");
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
            log.warn("[QualityScan] 查找质检阶段记录失败: orderId={}, bundleId={}, processCode={}", orderId, bundleId, processCode, e);
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
        dup.put("orderInfo", recordFactory.buildOrderInfo(order));
        dup.put("cuttingBundle", bundle);
        return dup;
    }

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

    private boolean hasText(String str) {
        return ScanExecutorSupport.hasText(str);
    }
}
