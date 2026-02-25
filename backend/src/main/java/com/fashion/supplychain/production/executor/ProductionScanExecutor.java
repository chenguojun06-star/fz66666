package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.*;
import com.fashion.supplychain.production.helper.InventoryValidator;
import com.fashion.supplychain.production.helper.ProcessStageDetector;
import com.fashion.supplychain.production.service.*;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 生产过程扫码执行器
 * 职责：
 * 1. 裁剪扫码
 * 2. 生产工序扫码（车缝、大烫、包装等）
 * 3. 自动工序识别
 * 4. 版型文件检查
 * 5. 单价解析
 * 6. 面料清单附加
 *
 * 提取自 ScanRecordOrchestrator（减少约200行代码）
 */
@Component
@Slf4j
public class ProductionScanExecutor {

    /**
     * 6个父进度节点（固定）：采购 → 裁剪 → 二次工艺 → 车缝 → 尾部 → 入库
     * "大烫/质检/剪线/包装"等均为"尾部"的子工序，不是独立父节点
     */
    private static final String[] FIXED_PRODUCTION_NODES = {
            "采购", "裁剪", "二次工艺", "车缝", "尾部", "入库"
    };

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProcessStageDetector processStageDetector;

    @Autowired
    private InventoryValidator inventoryValidator;

    @Autowired
    private SKUService skuService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private StyleAttachmentService styleAttachmentService;

    @Autowired
    private com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    /**
     * 执行生产扫码（裁剪或生产工序）
     */
    public Map<String, Object> execute(Map<String, Object> params, String requestId, String operatorId,
                                       String operatorName, String scanType, int quantity, boolean autoProcess,
                                       java.util.function.Function<String, String> colorResolver,
                                       java.util.function.Function<String, String> sizeResolver) {
        String scanCode = TextUtils.safeText(params.get("scanCode"));
        String orderNo = TextUtils.safeText(params.get("orderNo"));
        String paramColor = TextUtils.safeText(params.get("color"));
        String paramSize = TextUtils.safeText(params.get("size"));

        CuttingBundle bundle = null;
        ProductionOrder order = null;

        // 优先通过 scanCode（二维码内容）查找菲号
        if (hasText(scanCode)) {
            bundle = cuttingBundleService.getByQrCode(scanCode);
        }

        // 如果 scanCode 未匹配到菲号，尝试通过 orderNo + color + size 查找
        if ((bundle == null || !hasText(bundle.getId())) && hasText(orderNo) && hasText(paramColor) && hasText(paramSize)) {
            order = resolveOrder(null, orderNo);
            if (order != null) {
                try {
                    bundle = cuttingBundleService.getOne(new LambdaQueryWrapper<CuttingBundle>()
                            .eq(CuttingBundle::getProductionOrderId, order.getId())
                            .eq(CuttingBundle::getColor, paramColor)
                            .eq(CuttingBundle::getSize, paramSize)
                            .last("limit 1"));
                } catch (Exception e) {
                    log.warn("通过orderNo+color+size查找菲号失败: orderNo={}, color={}, size={}", orderNo, paramColor, paramSize, e);
                }
            }
        }

        // 无菲号时：允许 ORDER 模式扫码（SKU 批量提交路径，不要求 CuttingBundle）
        if (bundle == null || !hasText(bundle.getId())) {
            bundle = null; // 显式置空，后续流程统一判断
            if (!hasText(orderNo)) {
                if (!hasText(scanCode)) {
                    throw new IllegalArgumentException("扫码内容不能为空");
                }
                throw new IllegalStateException("未匹配到菲号");
            }
            // 有 orderNo：走 ORDER 模式，不强制要求菲号
            if (order == null) {
                order = resolveOrder(null, orderNo);
            }
            if (order == null) {
                throw new IllegalStateException("未匹配到订单");
            }
            if (!hasText(scanCode)) {
                scanCode = orderNo;
            }
            log.info("ORDER模式扫码（无菲号）: orderNo={}, color={}, size={}", orderNo, paramColor, paramSize);
        } else {
            // 有菲号：正常流程
            if (order == null) {
                order = resolveOrder(bundle.getProductionOrderId(), null);
            }
            if (order == null) {
                throw new IllegalStateException("未匹配到订单");
            }
            // 如果 scanCode 为空，使用菲号自身的QR码
            if (!hasText(scanCode) && hasText(bundle.getQrCode())) {
                scanCode = bundle.getQrCode();
            }
            if (!hasText(scanCode)) {
                scanCode = orderNo;
            }
        }

        // ★ 订单完成状态检查：所有环节统一拦截（与质检一致）
        String orderStatus = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equalsIgnoreCase(orderStatus)) {
            throw new IllegalStateException("进度节点已完成，该订单已结束生产");
        }

        String progressStage;
        if (autoProcess) {
            progressStage = processStageDetector.resolveAutoProcessName(order);
            if (!hasText(progressStage)) {
                throw new IllegalStateException("无法自动识别下一工序，请手动选择工序");
            }
        } else {
            progressStage = TextUtils.safeText(params.get("processName"));
            if (!hasText(progressStage)) {
                progressStage = TextUtils.safeText(params.get("progressStage"));
            }
            if (!hasText(progressStage)) {
                throw new IllegalArgumentException("缺少工序名称");
            }
        }

        progressStage = normalizeFixedProductionNodeName(progressStage);

        // ★ 子工序→父进度节点映射（关键：确保子工序数据聚合到正确的父节点）
        // 例如："上领"→"车缝", "上袖"→"车缝", "绣花"→"二次工艺"
        String childProcessName = progressStage; // 保留原始子工序名
        String parentStage = resolveParentProgressStage(order.getStyleNo(), childProcessName);
        if (parentStage != null) {
            log.info("子工序 '{}' 映射到父进度节点 '{}' (styleNo={})", childProcessName, parentStage, order.getStyleNo());
            progressStage = parentStage; // progressStage 存储父节点名（用于聚合）
        }

        // 判断是否裁剪
        boolean isCutting = "cutting".equalsIgnoreCase(scanType) ||
                            "裁剪".equals(progressStage.trim());

        // 裁剪前检查版型文件
        if (isCutting) {
            checkPatternForCutting(order);
        }

        // 验证数量不超过订单数量（用子工序名匹配，避免同父节点所有子工序量累加）
        inventoryValidator.validateNotExceedOrderQuantity(order, scanType, childProcessName, quantity, bundle);

        // 解析单价（优先用子工序名精确匹配，匹配不上再用父节点名模糊匹配）
        BigDecimal unitPrice = resolveUnitPriceFromTemplate(order.getStyleNo(), childProcessName);
        if ((unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) && !childProcessName.equals(progressStage)) {
            unitPrice = resolveUnitPriceFromTemplate(order.getStyleNo(), progressStage);
        }
        if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            log.warn("未找到工序单价: styleNo={}, processName={}, progressStage={}", order.getStyleNo(), childProcessName, progressStage);
            unitPrice = BigDecimal.ZERO;
        }

        // processCode 使用子工序名（用于去重和工序跟踪）
        String processCode = hasText(TextUtils.safeText(params.get("processCode")))
                             ? TextUtils.safeText(params.get("processCode"))
                             : childProcessName;

        String color = colorResolver.apply(null);
        String size = sizeResolver.apply(null);

        // 尝试更新已有记录
        Map<String, Object> updateResult = tryUpdateExistingBundleScanRecord(
                requestId, scanCode, bundle, order, scanType, progressStage, processCode,
                quantity, unitPrice, operatorId, operatorName, color, size,
                TextUtils.safeText(params.get("remark")), isCutting);

        if (updateResult != null) {
            // 附加面料清单（采购阶段）
            if ("采购".equals(progressStage.trim())) {
                attachMaterialPurchaseList(updateResult, order);
            }
            // 附加裁剪菲号信息
            if (isCutting) {
                updateResult.put("cuttingBundle", bundle);
            }
            return updateResult;
        }

        // 创建新扫码记录
        ScanRecord sr = buildProductionRecord(requestId, scanCode, bundle, order, scanType, progressStage,
                                             processCode, quantity, unitPrice, operatorId, operatorName,
                                             color, size, TextUtils.safeText(params.get("remark")));

        try {
            validateScanRecordForSave(sr);
            scanRecordService.saveScanRecord(sr);

            // ✅ 扫码成功后，更新工序跟踪记录（用于工资结算）—— 仅在有菲号时才更新
            // tracking 表按具体工序名（子工序）初始化，必须用 processCode（子工序名如"剪线"）匹配
            // progressStage 是父节点聚合名（如"尾部"），不存储在 tracking.process_code 中
            if (bundle != null && hasText(bundle.getId())) {
                try {
                    processTrackingOrchestrator.updateScanRecord(
                        bundle.getId(),
                        processCode,    // ✅ 用子工序名（如"剪线"）匹配，而非父节点名（如"尾部"）
                        operatorId,
                        operatorName,
                        sr.getId()
                    );
                    log.info("工序跟踪记录更新成功: bundleId={}, processCode(子工序)={}, progressStage(父)={}", bundle.getId(), processCode, progressStage);
                } catch (Exception e) {
                    log.warn("工序跟踪记录更新失败: bundleId={}, processCode={}", bundle.getId(), processCode, e);
                }
            }
        } catch (DuplicateKeyException dke) {
            log.info("生产扫码记录重复: requestId={}, scanCode={}", requestId, scanCode, dke);
            // 重试更新
            updateResult = tryUpdateExistingBundleScanRecord(
                    requestId, scanCode, bundle, order, scanType, progressStage, processCode,
                    quantity, unitPrice, operatorId, operatorName, color, size,
                    TextUtils.safeText(params.get("remark")), isCutting);
            if (updateResult != null) {
                if ("采购".equals(progressStage.trim())) {
                    attachMaterialPurchaseList(updateResult, order);
                }
                if (isCutting) {
                    updateResult.put("cuttingBundle", bundle);
                }
                return updateResult;
            }
        }

        // 重新计算订单进度
        try {
            productionOrderService.recomputeProgressFromRecords(order.getId());
        } catch (Exception e) {
            log.error("重新计算订单进度失败: orderId={}", order.getId(), e);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "扫码成功");
        result.put("scanRecord", sr);
        result.put("orderInfo", buildOrderInfo(order));

        // 附加面料清单（采购阶段）
        if ("采购".equals(progressStage.trim())) {
            attachMaterialPurchaseList(result, order);
        }

        // 附加裁剪菲号信息
        if (isCutting) {
            result.put("cuttingBundle", bundle);
        }

        return result;
    }

    /**
     * 尝试更新已有菲号扫码记录（领取锁定规则）
     */
    private Map<String, Object> tryUpdateExistingBundleScanRecord(
            String requestId, String scanCode, CuttingBundle bundle, ProductionOrder order,
            String scanType, String progressStage, String processCode, int quantity,
            BigDecimal unitPrice, String operatorId, String operatorName, String color, String size,
            String remark, boolean includeBundle) {

        if (bundle == null || !hasText(bundle.getId()) || order == null || !hasText(order.getId())) {
            return null;
        }

        try {
            ScanRecord existing = scanRecordService.getOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getCuttingBundleId, bundle.getId())
                    .eq(ScanRecord::getScanType, scanType)
                    .eq(ScanRecord::getScanResult, "success")
                    .gt(ScanRecord::getQuantity, 0)
                    .eq(ScanRecord::getProcessCode, processCode)  // 用子工序名匹配（非父节点）
                    .last("limit 1"));

            if (existing == null || !hasText(existing.getId())) {
                return null;
            }

            // 检查是否同一操作人（领取锁定）
            String existingOperatorId = existing.getOperatorId() == null ? null : existing.getOperatorId().trim();
            String existingOperatorName = existing.getOperatorName() == null ? null : existing.getOperatorName().trim();
            boolean isSameOperator = false;
            if (hasText(operatorId) && hasText(existingOperatorId)) {
                isSameOperator = operatorId.equals(existingOperatorId);
            } else if (hasText(operatorName) && hasText(existingOperatorName)) {
                isSameOperator = operatorName.equals(existingOperatorName);
            }

            if (!isSameOperator) {
                String otherName = hasText(existingOperatorName) ? existingOperatorName : "他人";
                throw new IllegalStateException("该菲号「" + processCode + "」环节已被「" + otherName + "」领取，无法重复操作");
            }

            int existedQty = existing.getQuantity() == null ? 0 : existing.getQuantity();
            int nextQty = Math.max(existedQty, quantity);

            ScanRecord patch = new ScanRecord();
            patch.setId(existing.getId());
            patch.setScanCode(scanCode);
            patch.setOrderId(order.getId());
            patch.setOrderNo(order.getOrderNo());
            patch.setStyleId(order.getStyleId());
            patch.setStyleNo(order.getStyleNo());
            patch.setColor(color);
            patch.setSize(size);
            patch.setQuantity(nextQty);
            patch.setUnitPrice(unitPrice);
            patch.setTotalAmount(computeTotalAmount(unitPrice, nextQty));
            patch.setProcessCode(processCode);
            patch.setProgressStage(progressStage);   // 父节点
            patch.setProcessName(processCode);        // 子工序名
            patch.setOperatorId(operatorId);
            patch.setOperatorName(operatorName);
            patch.setScanTime(LocalDateTime.now());
            patch.setScanType(scanType);
            patch.setScanResult("success");
            patch.setRemark(remark);
            patch.setCuttingBundleId(bundle.getId());
            patch.setCuttingBundleNo(bundle.getBundleNo());
            patch.setCuttingBundleQrCode(bundle.getQrCode());
            patch.setUpdateTime(LocalDateTime.now());

            if (skuService != null) {
                skuService.attachProcessUnitPrice(patch);
            }

            validateScanRecordForSave(patch);
            scanRecordService.updateById(patch);

            productionOrderService.recomputeProgressAsync(order.getId());

            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("message", "已扫码更新");

            ScanRecord returned = new ScanRecord();
            returned.setId(existing.getId());
            returned.setScanCode(scanCode);
            returned.setRequestId(requestId);
            returned.setOrderId(order.getId());
            returned.setOrderNo(order.getOrderNo());
            returned.setStyleId(order.getStyleId());
            returned.setStyleNo(order.getStyleNo());
            returned.setColor(color);
            returned.setSize(size);
            returned.setQuantity(nextQty);
            returned.setUnitPrice(unitPrice);
            returned.setTotalAmount(computeTotalAmount(unitPrice, nextQty));
            returned.setProcessCode(processCode);
            returned.setProgressStage(progressStage);   // 父节点
            returned.setProcessName(processCode);        // 子工序名
            returned.setOperatorId(operatorId);
            returned.setOperatorName(operatorName);
            returned.setScanTime(LocalDateTime.now());
            returned.setScanType(scanType);
            returned.setScanResult("success");
            returned.setRemark(remark);
            returned.setCuttingBundleId(bundle.getId());
            returned.setCuttingBundleNo(bundle.getBundleNo());
            returned.setCuttingBundleQrCode(bundle.getQrCode());
            result.put("scanRecord", returned);

            if (includeBundle) {
                result.put("cuttingBundle", bundle);
            }
            return result;
        } catch (Exception e) {
            log.warn("尝试更新已有扫码记录失败: orderId={}, requestId={}, scanCode={}",
                    order.getId(), requestId, scanCode, e);
            return null;
        }
    }

    /**
     * 标准化固定生产节点名称
     */
    public String normalizeFixedProductionNodeName(String name) {
        if (!hasText(name)) {
            return null;
        }
        String n = name.trim();
        for (String node : FIXED_PRODUCTION_NODES) {
            if (node.equals(n)) {
                return node;
            }
        }
        return n;
    }

    /**
     * 判断名称是否为固定节点之一
     */
    private boolean isFixedNode(String name) {
        if (!hasText(name)) return false;
        String n = name.trim();
        for (String node : FIXED_PRODUCTION_NODES) {
            if (node.equals(n)) return true;
        }
        return false;
    }

    /**
     * 从模板解析子工序对应的父进度节点
     * 例如：上领 → 车缝, 上袖 → 车缝, 大烫 → 尾部, 质检 → 尾部, 绣花 → 二次工艺
     * 模板 JSON 中通过 steps[].progressStage 字段定义父子关系
     *
     * 6个父进度节点：采购, 裁剪, 二次工艺, 车缝, 尾部, 入库
     */
    private String resolveParentProgressStage(String styleNo, String processName) {
        if (!hasText(styleNo) || !hasText(processName)) {
            return null;
        }
        // 已经是固定父节点，无需映射
        if (isFixedNode(processName)) {
            return null;
        }
        try {
            List<Map<String, Object>> nodes = templateLibraryService.resolveProgressNodeUnitPrices(styleNo.trim());
            if (nodes == null || nodes.isEmpty()) {
                return null;
            }
            for (Map<String, Object> item : nodes) {
                String name = item.get("name") != null ? item.get("name").toString().trim() : "";
                String pStage = item.get("progressStage") != null ? item.get("progressStage").toString().trim() : "";
                // 子工序名匹配，且 progressStage 指向不同的父节点
                if (hasText(name) && name.equals(processName.trim()) && hasText(pStage) && !pStage.equals(name)) {
                    // 验证父节点是已知的6个固定节点
                    String normalizedParent = normalizeFixedProductionNodeName(pStage);
                    if (normalizedParent != null && isFixedNode(normalizedParent)) {
                        return normalizedParent;
                    }
                    // 模板中的 progressStage 可能用了别名，尝试映射到6个标准父节点
                    if (templateLibraryService.progressStageNameMatches("车缝", pStage)) {
                        return "车缝";
                    }
                    if (templateLibraryService.progressStageNameMatches("二次工艺", pStage)) {
                        return "二次工艺";
                    }
                    // 尾部的子工序（大烫/质检/包装/剪线/整烫等）→ 父节点"尾部"
                    if (templateLibraryService.progressStageNameMatches("尾部", pStage)
                            || templateLibraryService.progressStageNameMatches("大烫", pStage)
                            || templateLibraryService.progressStageNameMatches("包装", pStage)
                            || templateLibraryService.isProgressQualityStageName(pStage)) {
                        return "尾部";
                    }
                    // 直接使用模板中的值（信任模板配置）
                    return pStage;
                }
            }
        } catch (Exception e) {
            log.warn("解析父进度节点失败: styleNo={}, processName={}", styleNo, processName, e);
        }
        return null;
    }

    /**
     * 检查裁剪版型文件
     */
    private void checkPatternForCutting(ProductionOrder order) {
        if (order == null || !hasText(order.getStyleId())) {
            return;
        }
        log.debug("检查版型文件: styleId={}", order.getStyleId());

        // 查询该款式的版型文件
        List<StyleAttachment> patterns;
        try {
            patterns = styleAttachmentService.list(
                new LambdaQueryWrapper<StyleAttachment>()
                    .eq(StyleAttachment::getStyleId, order.getStyleId())
                    .in(StyleAttachment::getBizType,
                        "pattern", "pattern_grading", "pattern_final")
                    .eq(StyleAttachment::getStatus, "active"));
        } catch (Exception e) {
            log.warn("查询版型文件失败，跳过版型校验: styleId={}", order.getStyleId(), e);
            return;
        }

        // 如果没有版型文件，抛出异常阻止裁剪
        if (patterns == null || patterns.isEmpty()) {
            log.warn("裁剪前检查失败：款式 {} (ID:{}) 缺少版型文件",
                order.getStyleNo(), order.getStyleId());
            throw new IllegalStateException(
                String.format("裁剪前必须上传版型文件，款式编号：%s", order.getStyleNo())
            );
        }

        log.info("版型文件检查通过：款式 {} 共有 {} 个版型文件",
            order.getStyleNo(), patterns.size());
    }

    /**
     * 从模板解析单价
     */
    private BigDecimal resolveUnitPriceFromTemplate(String styleNo, String processName) {
        String sn = hasText(styleNo) ? styleNo.trim() : null;
        String pn = hasText(processName) ? processName.trim() : null;
        if (!hasText(sn) || !hasText(pn)) {
            return null;
        }

        try {
            Map<String, BigDecimal> prices = templateLibraryService.resolveProcessUnitPrices(sn);
            if (prices == null || prices.isEmpty()) {
                return null;
            }

            // 精确匹配
            String normalized = normalizeFixedProductionNodeName(pn);
            if (hasText(normalized)) {
                BigDecimal exact = prices.get(normalized);
                if (exact != null && exact.compareTo(BigDecimal.ZERO) > 0) {
                    return exact;
                }
            }

            BigDecimal exact = prices.get(pn);
            if (exact != null && exact.compareTo(BigDecimal.ZERO) > 0) {
                return exact;
            }

            // 固定节点模糊匹配
            for (String n : FIXED_PRODUCTION_NODES) {
                if (!hasText(n)) {
                    continue;
                }
                if (templateLibraryService.progressStageNameMatches(n, pn)) {
                    BigDecimal v = prices.get(n);
                    if (v != null && v.compareTo(BigDecimal.ZERO) > 0) {
                        return v;
                    }
                }
            }

            // 模板中所有工序模糊匹配
            for (Map.Entry<String, BigDecimal> e : prices.entrySet()) {
                if (e == null) {
                    continue;
                }
                String k = e.getKey();
                if (!hasText(k)) {
                    continue;
                }
                if (templateLibraryService.progressStageNameMatches(k, pn)) {
                    BigDecimal v = e.getValue();
                    return v == null ? null : v;
                }
            }
        } catch (Exception e) {
            log.warn("解析单价失败: styleNo={}, processName={}", sn, pn, e);
        }

        return null;
    }

    /**
     * 附加面料采购清单
     */
    private void attachMaterialPurchaseList(Map<String, Object> result, ProductionOrder order) {
        if (result == null || order == null || !hasText(order.getId())) {
            return;
        }

        try {
            if (materialPurchaseService != null) {
                List<MaterialPurchase> list = materialPurchaseService.list(
                        new LambdaQueryWrapper<MaterialPurchase>()
                                .eq(MaterialPurchase::getOrderId, order.getId())
                                .eq(MaterialPurchase::getDeleteFlag, 0)
                                .orderByAsc(MaterialPurchase::getCreateTime));
                if (list != null && !list.isEmpty()) {
                    result.put("materialPurchases", list);
                }
            }
        } catch (Exception e) {
            log.warn("获取面料采购清单失败: orderId={}", order.getId(), e);
        }
    }

    /**
     * 构建生产扫码记录
     */
    private ScanRecord buildProductionRecord(String requestId, String scanCode, CuttingBundle bundle,
                                            ProductionOrder order, String scanType, String progressStage,
                                            String processCode, int quantity, BigDecimal unitPrice,
                                            String operatorId, String operatorName, String color, String size,
                                            String remark) {
        ScanRecord sr = new ScanRecord();
        sr.setRequestId(requestId);
        sr.setScanCode(scanCode);
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setColor(color);
        sr.setSize(size);
        sr.setQuantity(quantity);
        sr.setUnitPrice(unitPrice);
        sr.setTotalAmount(computeTotalAmount(unitPrice, quantity));
        sr.setProcessCode(processCode);
        sr.setProgressStage(progressStage);    // 父进度节点（如"车缝"），用于进度聚合
        sr.setProcessName(processCode);           // 子工序名（如"上领"），用于显示和识别
        sr.setOperatorId(operatorId);
        sr.setOperatorName(operatorName);
        sr.setScanTime(LocalDateTime.now());
        sr.setScanType(scanType);
        sr.setScanResult("success");
        sr.setRemark(remark);
        // 菲号可能为 null（ORDER 模式无菲号）
        if (bundle != null) {
            sr.setCuttingBundleId(bundle.getId());
            sr.setCuttingBundleNo(bundle.getBundleNo());
            sr.setCuttingBundleQrCode(bundle.getQrCode());
        }

        if (skuService != null) {
            skuService.attachProcessUnitPrice(sr);
        }

        return sr;
    }

    /**
     * 解析订单
     */
    private ProductionOrder resolveOrder(String orderId, String orderNo) {
        String oid = hasText(orderId) ? orderId.trim() : null;
        if (hasText(oid)) {
            ProductionOrder o = productionOrderService.getById(oid);
            if (o == null || o.getDeleteFlag() == null || o.getDeleteFlag() != 0) {
                return null;
            }
            return o;
        }

        String on = hasText(orderNo) ? orderNo.trim() : null;
        if (!hasText(on)) {
            return null;
        }
        return productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getOrderNo, on)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .last("limit 1"));
    }

    /**
     * 验证扫码记录
     */
    private void validateScanRecordForSave(ScanRecord sr) {
        if (sr == null) {
            return;
        }
        ensureMaxLen("扫码内容", sr.getScanCode(), 200);
        ensureMaxLen("备注", sr.getRemark(), 255);
        ensureMaxLen("进度环节", sr.getProgressStage(), 100);
        ensureMaxLen("工序名称", sr.getProcessName(), 100);
        ensureMaxLen("工序编码", sr.getProcessCode(), 50);
        ensureMaxLen("操作员名称", sr.getOperatorName(), 50);
        ensureMaxLen("扫码类型", sr.getScanType(), 20);
        ensureMaxLen("扫码结果", sr.getScanResult(), 20);
        ensureMaxLen("裁剪扎号二维码", sr.getCuttingBundleQrCode(), 200);
        ensureMaxLen("订单号", sr.getOrderNo(), 50);
        ensureMaxLen("款号", sr.getStyleNo(), 50);
        ensureMaxLen("颜色", sr.getColor(), 50);
        ensureMaxLen("尺码", sr.getSize(), 50);
        ensureMaxLen("requestId", sr.getRequestId(), 64);

        String st = hasText(sr.getScanType()) ? sr.getScanType().trim().toLowerCase() : "";
        if (("production".equals(st) || "quality".equals(st) || "warehouse".equals(st)) && skuService != null) {
            if (!skuService.validateSKU(sr)) {
                throw new IllegalStateException("SKU信息无效");
            }
        }
    }

    /**
     * 字段长度验证
     */
    private void ensureMaxLen(String fieldName, String value, int maxLen) {
        if (!hasText(value) || maxLen <= 0) {
            return;
        }
        String v = value.trim();
        if (v.length() > maxLen) {
            throw new IllegalArgumentException(fieldName + "过长（最多" + maxLen + "字符）");
        }
    }

    /**
     * 计算总金额
     */
    private BigDecimal computeTotalAmount(BigDecimal unitPrice, int quantity) {
        BigDecimal up = unitPrice == null ? BigDecimal.ZERO : unitPrice;
        int q = Math.max(0, quantity);
        return up.multiply(BigDecimal.valueOf(q)).setScale(2, RoundingMode.HALF_UP);
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
