package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
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
 * 2. 质检验收（inspect）
 * 3. 质检确认（confirm）- 入库
 * 4. 返修处理
 *
 * 提取自 ScanRecordOrchestrator（减少约300行代码）
 */
@Component
@Slf4j
public class QualityScanExecutor {

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

        // ★ 生产前置校验：车缝父节点下所有子工序都有归属人才能质检
        validateProductionPrerequisite(order, bundle.getId());

        String qualityStage = parseQualityStageFromParams(params);

        // 领取或验收阶段
        if (!"confirm".equals(qualityStage)) {
            return handleReceiveOrInspect(params, requestId, operatorId, operatorName, order, bundle, qty,
                                         qualityStage, colorResolver, sizeResolver);
        }

        // 确认阶段（入库）
        return handleConfirm(params, requestId, operatorId, operatorName, order, bundle, qty);
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
        if (existed != null && hasText(existed.getId())) {
            return handleExistedRecord(existed, operatorId, operatorName, qualityStage, order, bundle);
        }

        // 验收必须先领取
        if ("inspect".equals(qualityStage)) {
            validateInspectAfterReceive(order.getId(), bundle.getId(), operatorId, operatorName);
        }

        // 创建新记录
        ScanRecord sr = buildQualityRecord(params, requestId, operatorId, operatorName, order, bundle,
                                          qty, stageCode, stageName, colorResolver, sizeResolver);
        scanRecordService.saveScanRecord(sr);

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "receive".equals(qualityStage) ? "领取成功" : "验收成功");
        result.put("scanRecord", sr);
        result.put("orderInfo", buildOrderInfo(order));
        result.put("cuttingBundle", bundle);
        return result;
    }

    /**
     * 处理确认阶段（质检入库）
     */
    private Map<String, Object> handleConfirm(Map<String, Object> params, String requestId,
                                              String operatorId, String operatorName,
                                              ProductionOrder order, CuttingBundle bundle, int qty) {
        // 验证必须先领取和验收
        ScanRecord receivedStage = findQualityStageRecord(order.getId(), bundle.getId(), "quality_receive");
        if (receivedStage == null || !hasText(receivedStage.getId())) {
            throw new IllegalStateException("请先领取再确认");
        }
        ScanRecord inspectedStage = findQualityStageRecord(order.getId(), bundle.getId(), "quality_inspect");
        if (inspectedStage == null || !hasText(inspectedStage.getId())) {
            throw new IllegalStateException("请先验收再确认");
        }

        String qualityResult = parseQualityResultFromParams(params);
        boolean isUnqualified = "unqualified".equalsIgnoreCase(qualityResult);
        boolean isRepaired = "repaired".equalsIgnoreCase(qualityResult);

        // 检查是否已入库
        validateNotDuplicateWarehousing(order.getId(), bundle.getId(), isUnqualified);

        // 返修处理
        int availableQuantity = 0;
        boolean qtyAdjusted = false;
        if (isRepaired) {
            availableQuantity = computeRemainingRepairQuantity(order.getId(), bundle.getId(), null);
            if (availableQuantity <= 0) {
                throw new IllegalStateException("该菲号无可返修入库数量");
            }
            if (qty > availableQuantity) {
                qty = availableQuantity;
                qtyAdjusted = true;
            }
        }

        // 创建入库记录
        ProductWarehousing w = buildWarehousingRecord(params, order, bundle, receivedStage, qty,
                                                      isUnqualified, isRepaired);
        boolean ok = productWarehousingService.saveWarehousingAndUpdateOrder(w);
        if (!ok) {
            throw new IllegalStateException("质检失败");
        }

        // 查询生成的扫码记录
        ScanRecord sr = findWarehousingGeneratedRecord(w.getId());

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", isUnqualified ? "次品已录入" : (isRepaired ? "返修入库成功" : "质检成功"));
        if (qtyAdjusted && availableQuantity > 0) {
            result.put("message", "该菲号只可返修入库数量为" + availableQuantity + "，本次按" + qty + "录入");
        }
        result.put("scanRecord", sr);
        result.put("orderInfo", buildOrderInfo(order));
        result.put("cuttingBundle", bundle);
        if (isRepaired) {
            result.put("availableQuantity", availableQuantity);
            result.put("usedQuantity", qty);
        }
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
    private void validateProductionPrerequisite(ProductionOrder order, String bundleId) {
        if (order == null || !hasText(order.getId()) || !hasText(bundleId)) {
            return;
        }
        String orderId = order.getId();
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
        sr.setColor(colorResolver.apply(null));
        sr.setSize(sizeResolver.apply(null));
        sr.setQuantity(qty);
        sr.setProcessCode(stageCode);
        sr.setProgressStage(stageName);
        sr.setProcessName(stageName);
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
     * 构建入库记录
     */
    private ProductWarehousing buildWarehousingRecord(Map<String, Object> params, ProductionOrder order,
                                                     CuttingBundle bundle, ScanRecord receivedStage,
                                                     int qty, boolean isUnqualified, boolean isRepaired) {
        ProductWarehousing w = new ProductWarehousing();
        w.setOrderId(order.getId());
        w.setWarehousingType("quality_scan");
        w.setCuttingBundleQrCode(bundle.getQrCode());
        w.setWarehousingQuantity(qty);

        if (receivedStage != null) {
            w.setReceiverId(TextUtils.safeText(receivedStage.getOperatorId()));
            w.setReceiverName(TextUtils.safeText(receivedStage.getOperatorName()));
            w.setReceivedTime(receivedStage.getScanTime());
            // 同步填充质检人员信息
            w.setQualityOperatorId(TextUtils.safeText(receivedStage.getOperatorId()));
            w.setQualityOperatorName(TextUtils.safeText(receivedStage.getOperatorName()));
        }

        // 从参数中获取操作人信息（confirm阶段的操作人）
        String operatorId = TextUtils.safeText(params.get("operatorId"));
        String operatorName = TextUtils.safeText(params.get("operatorName"));
        if (hasText(operatorId) && !hasText(w.getQualityOperatorId())) {
            w.setQualityOperatorId(operatorId);
        }
        if (hasText(operatorName) && !hasText(w.getQualityOperatorName())) {
            w.setQualityOperatorName(operatorName);
        }

        w.setInspectionStatus("inspected");

        if (isUnqualified) {
            String defectCategory = TextUtils.safeText(params.get("defectCategory"));
            String defectRemark = TextUtils.safeText(params.get("defectRemark"));

            if (!hasText(defectCategory)) {
                throw new IllegalArgumentException("请选择次品类别");
            }
            if (!hasText(defectRemark)) {
                throw new IllegalArgumentException("请选择次品处理方式");
            }

            String dr = defectRemark.trim();
            if (!("返修".equals(dr) || "报废".equals(dr))) {
                throw new IllegalArgumentException("次品处理方式只能选择：返修/报废");
            }

            w.setQualifiedQuantity(0);
            w.setUnqualifiedQuantity(qty);
            w.setDefectCategory(defectCategory);
            w.setDefectRemark(dr);

            String unqualifiedImageUrls = TextUtils.safeText(params.get("unqualifiedImageUrls"));
            if (hasText(unqualifiedImageUrls)) {
                w.setUnqualifiedImageUrls(unqualifiedImageUrls);
            }
        } else {
            w.setQualifiedQuantity(qty);
            w.setUnqualifiedQuantity(0);
        }

        String repairRemark = TextUtils.safeText(params.get("repairRemark"));
        if (isRepaired && !hasText(repairRemark)) {
            repairRemark = "返修完成";
        }
        if (hasText(repairRemark)) {
            w.setRepairRemark(repairRemark);
        }

        w.setQualityStatus(isUnqualified ? "unqualified" : "qualified");
        return w;
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
}
