package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.ProcessSynonymMapping;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.*;
import com.fashion.supplychain.production.helper.DuplicateScanPreventer;
import com.fashion.supplychain.production.helper.InventoryValidator;
import com.fashion.supplychain.production.helper.ProcessStageDetector;
import com.fashion.supplychain.production.helper.lookup.BundleLookupContext;
import com.fashion.supplychain.production.service.*;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fashion.supplychain.websocket.service.WebSocketService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
@RequiredArgsConstructor
public class ProductionScanExecutor {

    /**
     * 6个父进度节点（固定）：采购 → 裁剪 → 二次工艺 → 车缝 → 尾部 → 入库
     * "大烫/质检/剪线/包装"等均为"尾部"的子工序，不是独立父节点
     */
    private static final String[] FIXED_PRODUCTION_NODES = {
            "采购", "裁剪", "二次工艺", "车缝", "尾部", "入库"
    };

    private final ProductionScanStageSupport stageSupport;

    private final ScanRecordService scanRecordService;

    private final CuttingBundleLookupService bundleLookupService;

    private final ProductionOrderService productionOrderService;

    private final ProcessStageDetector processStageDetector;

    private final InventoryValidator inventoryValidator;

    private final DuplicateScanPreventer duplicateScanPreventer;

    private final SKUService skuService;

    private final TemplateLibraryService templateLibraryService;

    private final MaterialPurchaseService materialPurchaseService;

    private final StyleAttachmentService styleAttachmentService;

    private final StyleInfoService styleInfoService;

    private final SecondaryProcessService secondaryProcessService;

    private final ProcessParentMappingService processParentMappingService;

    private final ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    private final ProductionProcessTrackingService trackingService;

    private final WebSocketService webSocketService;


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

        BundleLookupContext lookupContext = BundleLookupContext.from(params);
        CuttingBundle bundle = bundleLookupService.lookup(lookupContext);
        ProductionOrder order = null;


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

        if (quantity <= 0) {
            throw new IllegalArgumentException("扫码数量必须大于0");
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

        // ★ ORDER 模式守卫：无菲号时只允许采购/裁剪阶段，防止 ORDER 码绕过前端进入生产工序
        if (bundle == null) {
            boolean isProcurementOrCutting = "采购".equals(progressStage) || "裁剪".equals(progressStage)
                    || ProcessSynonymMapping.isEquivalent("采购", progressStage)
                    || ProcessSynonymMapping.isEquivalent("裁剪", progressStage);
            if (!isProcurementOrCutting) {
                throw new IllegalStateException(
                    "订单码只能用于采购和裁剪阶段，当前工序[" + progressStage + "]请扫描菲号二维码");
            }
        }

        // ★ 子工序→父进度节点映射（关键：确保子工序数据聚合到正确的父节点）
        // 例如："上领"→"车缝", "上袖"→"车缝", "绣花"→"二次工艺"
        String childProcessName = progressStage; // 保留原始子工序名
        String parentStage = resolveParentProgressStage(order.getStyleNo(), childProcessName);
        if (parentStage != null) {
            log.info("子工序 '{}' 映射到父进度节点 '{}' (styleNo={})", childProcessName, parentStage, order.getStyleNo());
            progressStage = parentStage; // progressStage 存储父节点名（用于聚合）
        }

        // ★ 阶段门控校验：进入当前父节点前，上一个父节点的全部子工序必须完成
        // 例如：扫描"尾部"子工序时，"车缝"的所有子工序必须全部有扫码记录
        stageSupport.validateParentStagePrerequisite(order, bundle, progressStage, childProcessName);

        // ★ 拆分守卫：父菲号在拆分工序及之前工序不允许扫码，后续工序仍可扫码
        if (bundle != null && "split_parent".equals(bundle.getSplitStatus()) && bundle.getSplitProcessOrder() != null) {
            List<ProductionProcessTracking> bundleTrackings = trackingService.getByBundleId(bundle.getId());
            final String matchChild = childProcessName;
            final String matchStage = progressStage;
            boolean hasActiveTracking = bundleTrackings.stream()
                    .anyMatch(t -> (matchChild.equals(t.getProcessName()) || matchStage.equals(t.getProcessName()))
                            && !"split_archived".equals(t.getScanStatus()));
            if (!hasActiveTracking) {
                String splitInfo = bundle.getSplitProcessName() != null
                        ? "该菲号在「" + bundle.getSplitProcessName() + "」工序已拆分，请扫描子菲号"
                        : "该菲号已拆分，请扫描子菲号";
                throw new BusinessException(splitInfo);
            }
        }

        // 判断是否裁剪
        boolean isCutting = "cutting".equalsIgnoreCase(scanType) ||
                            "裁剪".equals(progressStage.trim());

        // 裁剪前检查版型文件
        if (isCutting) {
            checkPatternForCutting(order);
        }

        // 解析单价（优先用子工序名精确匹配，匹配不上再用父节点名模糊匹配）
        BigDecimal unitPrice = resolveUnitPriceFromTemplate(order.getStyleNo(), childProcessName);
        if ((unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) && !childProcessName.equals(progressStage)) {
            unitPrice = resolveUnitPriceFromTemplate(order.getStyleNo(), progressStage);
        }
        if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            log.warn("未找到工序单价: styleNo={}, processName={}, progressStage={}", order.getStyleNo(), childProcessName, progressStage);
            unitPrice = BigDecimal.ZERO;
        }

        // 单价为0时在响应中添加警告提示
        boolean unitPriceZero = unitPrice.compareTo(BigDecimal.ZERO) <= 0;

        String processCode = hasText(TextUtils.safeText(params.get("processCode")))
                             ? TextUtils.safeText(params.get("processCode"))
                             : resolveProcessCodeFromTemplate(order.getStyleNo(), childProcessName);
        if (!hasText(processCode)) {
            processCode = childProcessName;
        }

        String duplicateCheckScanCode = scanCode;
        if (!hasText(duplicateCheckScanCode) && bundle != null) {
            duplicateCheckScanCode = TextUtils.safeText(bundle.getQrCode());
        }
        if (!hasText(duplicateCheckScanCode)) {
            duplicateCheckScanCode = orderNo;
        }

        Integer bundleQuantity = bundle != null ? bundle.getQuantity() : quantity;
        if (duplicateScanPreventer.hasRecentDuplicateScan(
                duplicateCheckScanCode,
                scanType,
                bundleQuantity,
                null,
                processCode,
                operatorId)) {
            Map<String, Object> duplicate = new HashMap<>();
            duplicate.put("success", true);
            duplicate.put("message", "扫码过快，已自动忽略重复提交");
            duplicate.put("duplicateIgnored", true);
            return duplicate;
        }

        // 验证数量不超过订单数量（用子工序名匹配，避免同父节点所有子工序量累加）
        inventoryValidator.validateNotExceedOrderQuantity(order, scanType, childProcessName, quantity, bundle);

        String color = colorResolver.apply(null);
        // 🔧 修复(2026-02-25)：orchestrator 传入的 resolver 未携带 bundle/order 上下文，
        // executor 内部已解析出 bundle 和 order，在此 fallback 确保 ORDER 模式也有颜色/尺码
        if (!hasText(color) && bundle != null) {
            color = TextUtils.safeText(bundle.getColor());
        }
        if (!hasText(color) && order != null) {
            color = TextUtils.safeText(order.getColor());
        }
        String size = sizeResolver.apply(null);
        if (!hasText(size) && bundle != null) {
            size = TextUtils.safeText(bundle.getSize());
        }
        if (!hasText(size) && order != null) {
            size = TextUtils.safeText(order.getSize());
        }

        // 尝试更新已有记录
        Map<String, Object> updateResult = tryUpdateExistingBundleScanRecord(
                requestId, scanCode, bundle, order, scanType, progressStage, processCode, childProcessName,
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

        // 解析客户端扫码时间
        LocalDateTime clientScanTime = null;
        try {
            String scanTimeStr = TextUtils.safeText(params.get("scanTime"));
            if (hasText(scanTimeStr)) {
                clientScanTime = ParamUtils.parseDateTime(scanTimeStr);
            }
        } catch (Exception e) {
            log.warn("解析客户端scanTime失败: {}", params.get("scanTime"));
        }

        // 创建新扫码记录
        ScanRecord sr = buildProductionRecord(requestId, scanCode, bundle, order, scanType, progressStage,
                                             processCode, childProcessName, quantity, unitPrice, operatorId, operatorName,
                                             color, size, TextUtils.safeText(params.get("remark")), clientScanTime);

        // AI 财务风控拦截：检查是否存在恶意的刷单/异常高产（根据工价和金额等判断）
        // 简化实现：如果单次扫码导致计件工资极高（例如单次超 1000 元）进行拦截
        if (sr.getTotalAmount() != null && sr.getTotalAmount().doubleValue() > 1000.0) {
            try {
                duplicateScanPreventer.validateReasonableOutput(operatorId, quantity, 10); // 假定一个极小的容忍度触发异常
            } catch (IllegalStateException e) {
                // 如果被风控拦截，记录失败扫码，并直接抛出异常阻止
                sr.setScanResult("failure");
                sr.setRemark("风控拦截：" + e.getMessage());
                scanRecordService.saveScanRecord(sr);

                // 触发风控预警推送到 AI 小云
                Map<String, Object> riskData = new HashMap<>();
                riskData.put("operatorName", operatorName);
                riskData.put("quantity", quantity);
                riskData.put("processCode", processCode);
                com.fashion.supplychain.intelligence.dto.TraceableAdvice advice = com.fashion.supplychain.intelligence.dto.TraceableAdvice.builder()
                        .traceId(java.util.UUID.randomUUID().toString())
                        .title("🚨 财务风控：检测到异常高产/高薪扫码")
                        .summary("工人 " + operatorName + " 提交了 " + quantity + " 件 " + processCode + " 扫码，单次计件金额高达 " + sr.getTotalAmount() + " 元。")
                        .reasoningChain(java.util.List.of(
                            "本次提交数量：" + quantity + " 件",
                            "本次计件金额：" + sr.getTotalAmount() + " 元",
                            "判定结果：超出系统设定的单笔安全阈值，已自动拦截并冻结计件。"
                        ))
                        .confidenceScore(5)
                        .proposedActions(java.util.List.of(
                            com.fashion.supplychain.intelligence.dto.TraceableAdvice.ProposedAction.builder()
                                .label("立即核实并警告")
                                .actionCommand("send_notification")
                                .actionParams(Map.of("toUser", operatorName, "content", "您的扫码数据异常，已被系统拦截，请联系厂长。"))
                                .build(),
                            com.fashion.supplychain.intelligence.dto.TraceableAdvice.ProposedAction.builder()
                                .label("忽略")
                                .actionCommand("IGNORE")
                                .build()
                        ))
                        .build();
                String userId = com.fashion.supplychain.common.UserContext.userId();
                if (userId != null) {
                    webSocketService.sendToUser(userId,
                        com.fashion.supplychain.websocket.enums.WebSocketMessageType.TRACEABLE_ADVICE,
                        advice);
                }

                throw new IllegalStateException("AI 财务风控拦截：单次扫码金额/数量过大，请拆分批次或联系厂长核实。");
            }
        }

        try {
            validateScanRecordForSave(sr);
            log.info("[ScanSave] 即将写入扫码记录: orderId={}, bundleId={}, scanType={}, progressStage={}, qty={}, operator={}",
                    sr.getOrderId(), sr.getCuttingBundleId(), sr.getScanType(), sr.getProgressStage(),
                    sr.getQuantity(), sr.getOperatorId());
            scanRecordService.saveScanRecord(sr);
            log.info("[ScanSave] 扫码记录写入成功: recordId={}", sr.getId());
            // ✅ 扫码成功后，更新工序跟踪记录（用于工资结算）—— 仅在有菲号时才更新
            // tracking 表用 node["name"]（即progressStage父节点名，如"尾部"）作为 process_code 初始化
            // 兼容策略：先用 processCode（子工序名，如"剪线"）匹配，找不到再用 progressStage（父节点名）回退
            if (bundle != null && hasText(bundle.getId())) {
                try {
                    boolean trackingUpdated = processTrackingOrchestrator.updateScanRecord(
                        bundle.getId(),
                        childProcessName,    // 第1次尝试：子工序名（如"剪线"）
                        operatorId,
                        operatorName,
                        sr.getId()
                    );
                    if (!trackingUpdated && hasText(progressStage) && !childProcessName.equals(progressStage)) {
                        // 第2次尝试：父节点名（如"尾部"）—— tracking 表按 progressStage 初始化时用此路径
                        trackingUpdated = processTrackingOrchestrator.updateScanRecord(
                            bundle.getId(),
                            progressStage,
                            operatorId,
                            operatorName,
                            sr.getId()
                        );
                        if (trackingUpdated) {
                            log.info("工序跟踪记录更新成功（回退到父节点名）: bundleId={}, progressStage={}", bundle.getId(), progressStage);
                        }
                    }
                    if (trackingUpdated) {
                        log.info("工序跟踪记录更新成功: bundleId={}, processCode={}, progressStage={}", bundle.getId(), processCode, progressStage);
                    } else {
                        log.warn("工序跟踪记录未找到（不阻断扫码）: bundleId={}, processCode={}, progressStage={}", bundle.getId(), processCode, progressStage);
                    }
                } catch (BusinessException be) {
                    log.warn("工序跟踪拒绝领取（不阻断扫码）: bundleId={}, processCode={}, msg={}", bundle.getId(), processCode, be.getMessage());
                } catch (IllegalStateException ise) {
                    log.warn("工序跟踪状态冲突（不阻断扫码）: bundleId={}, processCode={}, msg={}", bundle.getId(), processCode, ise.getMessage());
                } catch (Exception e) {
                    // 非业务异常（DB故障等）：记录为ERROR但不阻断扫码，避免因追踪系统故障导致用户无法扫码
                    log.error("工序跟踪记录更新失败（非业务异常）: bundleId={}, processCode={}", bundle.getId(), processCode, e);
                }
            }
        } catch (DuplicateKeyException dke) {
            log.info("生产扫码记录重复: requestId={}, scanCode={}", requestId, scanCode, dke);
            // 重试更新
            updateResult = tryUpdateExistingBundleScanRecord(
                    requestId, scanCode, bundle, order, scanType, progressStage, processCode, childProcessName,
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

        // ★ 采购阶段：不再自动批量领取全部采购任务
        // 旧逻辑会将该订单下所有 pending 采购任务自动分配给扫码工人，
        // 导致"下单后面辅料采购自动领取"的 Bug — 正确流程是由工人手动领取各自的采购任务
        // 保留附加面料清单逻辑（见下方 attachMaterialPurchaseList）

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        String bundleNoStr = bundle != null && bundle.getBundleNo() != null ? String.valueOf(bundle.getBundleNo()) : "";
        String displayProcessName = processCode != null ? processCode : (progressStage != null ? progressStage : "");
        result.put("message", "扫码成功" + (displayProcessName.isEmpty() ? "" : " · " + displayProcessName) + (bundleNoStr.isEmpty() ? "" : " · 菲号" + bundleNoStr));
        result.put("scanRecord", sr);
        result.put("orderInfo", buildOrderInfo(order));
        result.put("childProcessName", childProcessName);
        result.put("parentProgressStage", progressStage);

        String nextStage;
        switch (sr.getScanType() != null ? sr.getScanType().trim().toLowerCase() : "") {
            case "cutting":    nextStage = "production"; break;
            case "production": nextStage = "quality"; break;
            case "quality":    nextStage = "warehouse"; break;
            default:           nextStage = null;
        }
        if (hasText(nextStage)) {
            result.put("nextScanType", nextStage);
            result.put("nextStageHint", "下一环节: " + nextStage);
        }

        if (unitPriceZero) {
            result.put("unitPriceHint", "该工序未设置单价，扫码后工资为0，请联系管理员设置单价");
        }

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
            String scanType, String progressStage, String processCode, String childProcessName, int quantity,
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

            Integer bundleQuantity = bundle.getQuantity();
            if (duplicateScanPreventer.isWithinDuplicateInterval(existing.getScanTime(), bundleQuantity, null)) {
                Map<String, Object> duplicate = new HashMap<>();
                duplicate.put("success", true);
                duplicate.put("message", "扫码过快，已自动忽略重复提交");
                duplicate.put("duplicateIgnored", true);
                duplicate.put("scanRecord", existing);
                return duplicate;
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
            patch.setProcessName(childProcessName);  // 子工序名
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
            returned.setProcessName(childProcessName);   // 子工序名
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
        } catch (IllegalStateException ise) {
            // ✅ Re-throw: "已被他人领取" 是业务规则拒绝，必须反馈给用户
            log.warn("领取冲突（他人已领取）: orderId={}, processCode={}, msg={}",
                    order.getId(), processCode, ise.getMessage());
            throw ise;
        } catch (Exception e) {
            log.warn("尝试更新已有扫码记录失败: orderId={}, requestId={}, scanCode={}",
                    order.getId(), requestId, scanCode, e);
            return null;
        }
    }

    /**
     * 标准化固定生产节点名称
     * 委托给 ProcessStageDetector 统一实现（含模糊匹配 + CHILD_TO_PARENT 映射）
     */
    public String normalizeFixedProductionNodeName(String name) {
        return processStageDetector.normalizeFixedProductionNodeName(name);
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
     *
     * 解析优先级：
     * 1. 模板 progressStage 直接指向6个固定父节点 → 直接使用
     * 2. 模板 progressStage 为别名 → normalizeFixedProductionNodeName 归一化
     * 3. 模板 progressStage 为别名但无法归一化 → 动态映射表查找
     * 4. 模板中找不到 / progressStage 与 name 相同 → 动态映射表按 processName 查找
     * 5. 以上均无结果 → 返回 null（调用方决定是否使用 processName 本身）
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
            if (nodes != null && !nodes.isEmpty()) {
                for (Map<String, Object> item : nodes) {
                    String name = item.get("name") != null ? item.get("name").toString().trim() : "";
                    String pStage = item.get("progressStage") != null ? item.get("progressStage").toString().trim() : "";

                    if (!hasText(name) || !name.equals(processName.trim())) {
                        continue;
                    }
                    // ── 找到匹配的工序 ──

                    // Case 1: progressStage 直接是 6 个固定父节点之一
                    if (hasText(pStage) && isFixedNode(pStage)) {
                        return pStage;
                    }
                    // Case 2: progressStage 是别名（如 "sewing"），尝试归一化
                    if (hasText(pStage) && !pStage.equals(name)) {
                        String normalizedParent = normalizeFixedProductionNodeName(pStage);
                        if (normalizedParent != null && isFixedNode(normalizedParent)) {
                            return normalizedParent;
                        }
                        // 别名无法归一化 → 尝试动态映射表
                        String mapped = processParentMappingService.resolveParentNode(pStage);
                        if (mapped != null) {
                            return mapped;
                        }
                    }
                    // Case 3: progressStage 与 name 相同或为空
                    //   → 模板未正确配置父节点，跳出循环走动态映射兜底
                    break;
                }
            }
        } catch (Exception e) {
            log.warn("解析父进度节点失败: styleNo={}, processName={}", styleNo, processName, e);
        }
        // ── 动态映射兜底：从 t_process_parent_mapping 表按工序名查找 ──
        String dynamicParent = processParentMappingService.resolveParentNode(processName);
        if (dynamicParent != null) {
            log.info("工序 '{}' 通过动态映射表 → 父节点 '{}' (styleNo={})", processName, dynamicParent, styleNo);
            return dynamicParent;
        }
        return null;
    }

    private String resolveProcessCodeFromTemplate(String styleNo, String processName) {
        String sn = hasText(styleNo) ? styleNo.trim() : null;
        String pn = hasText(processName) ? processName.trim() : null;
        if (!hasText(sn) || !hasText(pn)) {
            return null;
        }
        try {
            List<Map<String, Object>> nodes = templateLibraryService.resolveProgressNodeUnitPrices(sn);
            if (nodes == null || nodes.isEmpty()) {
                return null;
            }
            for (Map<String, Object> node : nodes) {
                String name = String.valueOf(node.getOrDefault("name", "")).trim();
                if (pn.equals(name)) {
                    String id = String.valueOf(node.getOrDefault("id", "")).trim();
                    return hasText(id) ? id : null;
                }
            }
        } catch (Exception e) {
            log.warn("解析工序编号失败: styleNo={}, processName={}", sn, pn, e);
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

            BigDecimal exact = prices.get(pn);
            if (exact != null && exact.compareTo(BigDecimal.ZERO) > 0) {
                return exact;
            }

            String normalized = normalizeFixedProductionNodeName(pn);
            if (hasText(normalized) && !normalized.equals(pn)) {
                BigDecimal normPrice = prices.get(normalized);
                if (normPrice != null && normPrice.compareTo(BigDecimal.ZERO) > 0) {
                    return normPrice;
                }
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
                                            String processCode, String processName, int quantity, BigDecimal unitPrice,
                                            String operatorId, String operatorName, String color, String size,
                                            String remark, LocalDateTime clientScanTime) {
        ScanRecord sr = new ScanRecord();
        sr.setRequestId(requestId);
        sr.setScanCode(scanCode);
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setTenantId(order.getTenantId());
        sr.setColor(color);
        sr.setSize(size);
        sr.setQuantity(quantity);
        sr.setUnitPrice(unitPrice);
        sr.setTotalAmount(computeTotalAmount(unitPrice, quantity));
        sr.setProcessCode(processCode);
        sr.setProgressStage(progressStage);    // 父进度节点（如"车缝"），用于进度聚合
        sr.setProcessName(processName);        // 子工序名（如"上领"），用于显示和识别
        sr.setOperatorId(operatorId);
        sr.setOperatorName(operatorName);
        // 记录扫码时归属的外发工厂（普通租户账号此值为null）
        sr.setFactoryId(com.fashion.supplychain.common.UserContext.factoryId());

        // 优先使用客户端传入的扫码时间（离线/延迟上传场景），若无效则使用服务器时间
        // 有效范围：[now-7天, now+5分钟]，防止1970年等极旧时间写入数据库
        LocalDateTime now = LocalDateTime.now();
        if (clientScanTime != null
                && clientScanTime.isAfter(now.minusDays(7))
                && !clientScanTime.isAfter(now.plusMinutes(5))) {
            sr.setScanTime(clientScanTime);
        } else {
            if (clientScanTime != null) {
                log.warn("客户端scanTime超出合法范围，已使用服务器时间: clientTime={}", clientScanTime);
            }
            sr.setScanTime(now);
        }

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
     * 构建订单信息（含工艺制单和二次工艺）
     */
    private Map<String, Object> buildOrderInfo(ProductionOrder order) {
        Map<String, Object> info = new HashMap<>();
        info.put("orderNo", order.getOrderNo());
        info.put("styleNo", order.getStyleNo());

        if (hasText(order.getStyleId())) {
            try {
                com.fashion.supplychain.style.entity.StyleInfo si = styleInfoService.getById(order.getStyleId());
                if (si != null && hasText(si.getDescription())) {
                    info.put("description", si.getDescription());
                }
            } catch (Exception e) {
                log.warn("buildOrderInfo查询款式描述失败: styleId={}", order.getStyleId(), e);
            }

            try {
                Long styleIdLong = null;
                try { styleIdLong = Long.valueOf(order.getStyleId()); } catch (NumberFormatException ignore) {}
                if (styleIdLong != null) {
                    java.util.List<com.fashion.supplychain.style.entity.SecondaryProcess> processes =
                            secondaryProcessService.listByStyleId(styleIdLong);
                    if (processes != null && !processes.isEmpty()) {
                        info.put("secondaryProcesses", processes);
                    }
                }
            } catch (Exception e) {
                log.warn("buildOrderInfo查询二次工艺失败: styleId={}", order.getStyleId(), e);
            }
        }

        return info;
    }

    private boolean hasText(String str) {
        return StringUtils.hasText(str);
    }
}
