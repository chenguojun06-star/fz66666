package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.ProcessSynonymMapping;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.*;
import com.fashion.supplychain.production.helper.DuplicateScanPreventer;
import com.fashion.supplychain.production.helper.InventoryValidator;
import com.fashion.supplychain.production.helper.ProcessStageDetector;
import com.fashion.supplychain.production.helper.lookup.BundleLookupContext;
import com.fashion.supplychain.production.service.*;
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

@Component
@Slf4j
@RequiredArgsConstructor
public class ProductionScanExecutor {

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
    private final StyleInfoService styleInfoService;
    private final SecondaryProcessService secondaryProcessService;
    private final ProcessParentMappingService processParentMappingService;
    private final ProductionProcessTrackingOrchestrator processTrackingOrchestrator;
    private final ProductionProcessTrackingService trackingService;
    private final WebSocketService webSocketService;

    private final ScanExecutorSupport executorSupport;

    public Map<String, Object> execute(Map<String, Object> params, String requestId, String operatorId,
                                       String operatorName, String scanType, int quantity, boolean autoProcess,
                                       java.util.function.Function<String, String> colorResolver,
                                       java.util.function.Function<String, String> sizeResolver) {
        ScanContext ctx = resolveScanContext(params, scanType, quantity, autoProcess, operatorId, operatorName);

        executorSupport.validateBundleNotBlocked(ctx.bundle, "生产");

        resolveProcessStage(ctx, params, autoProcess);

        stageSupport.validateParentStagePrerequisite(ctx.order, ctx.bundle, ctx.progressStage, ctx.childProcessName);
        validateSplitGuard(ctx);

        boolean isCutting = "cutting".equalsIgnoreCase(scanType) ||
                            "裁剪".equals(ctx.progressStage != null ? ctx.progressStage.trim() : null);
        if (isCutting) {
            stageSupport.checkPatternForCutting(ctx.order);
        }

        resolveUnitPriceAndProcessCode(ctx);

        Map<String, Object> dupResult = checkDuplicateScan(ctx, scanType, operatorId);
        if (dupResult != null) return dupResult;

        inventoryValidator.validateNotExceedOrderQuantity(ctx.order, scanType, ctx.childProcessName, quantity, ctx.bundle);

        String color = resolveColor(colorResolver, ctx.bundle, ctx.order);
        String size = resolveSize(sizeResolver, ctx.bundle, ctx.order);

        Map<String, Object> updateResult = tryUpdateExistingBundleScanRecord(
                requestId, ctx.scanCode, ctx.bundle, ctx.order, scanType, ctx.progressStage, ctx.processCode,
                ctx.childProcessName, quantity, ctx.unitPrice, operatorId, operatorName, color, size,
                TextUtils.safeText(params.get("remark")), isCutting);
        if (updateResult != null) {
            if ("采购".equals(ctx.progressStage)) attachMaterialPurchaseList(updateResult, ctx.order);
            if (isCutting) updateResult.put("cuttingBundle", ctx.bundle);
            return updateResult;
        }

        LocalDateTime clientScanTime = parseClientScanTime(params);
        ScanRecord sr = buildProductionRecord(requestId, ctx.scanCode, ctx.bundle, ctx.order, scanType,
                ctx.progressStage, ctx.processCode, ctx.childProcessName, quantity, ctx.unitPrice,
                operatorId, operatorName, color, size, TextUtils.safeText(params.get("remark")), clientScanTime);

        handleFinancialRiskControl(sr, operatorId, operatorName, quantity, ctx.processCode);

        try {
            validateScanRecordForSave(sr);
            log.info("[ScanSave] 即将写入扫码记录: orderId={}, bundleId={}, scanType={}, progressStage={}, qty={}, operator={}",
                    sr.getOrderId(), sr.getCuttingBundleId(), sr.getScanType(), sr.getProgressStage(), sr.getQuantity(), sr.getOperatorId());
            scanRecordService.saveScanRecord(sr);
            log.info("[ScanSave] 扫码记录写入成功: recordId={}", sr.getId());
            updateProcessTracking(ctx.bundle, ctx.childProcessName, ctx.progressStage, ctx.processCode, operatorId, operatorName, sr.getId());
        } catch (DuplicateKeyException dke) {
            log.info("生产扫码记录重复: requestId={}, scanCode={}", requestId, ctx.scanCode, dke);
            Map<String, Object> retryResult = tryUpdateExistingBundleScanRecord(
                    requestId, ctx.scanCode, ctx.bundle, ctx.order, scanType, ctx.progressStage, ctx.processCode,
                    ctx.childProcessName, quantity, ctx.unitPrice, operatorId, operatorName, color, size,
                    TextUtils.safeText(params.get("remark")), isCutting);
            if (retryResult != null) {
                if ("采购".equals(ctx.progressStage)) attachMaterialPurchaseList(retryResult, ctx.order);
                if (isCutting) retryResult.put("cuttingBundle", ctx.bundle);
                return retryResult;
            }
        }

        executorSupport.recomputeProgressSync(ctx.order.getId());

        return buildSuccessResult(sr, ctx, isCutting);
    }

    private ScanContext resolveScanContext(Map<String, Object> params, String scanType, int quantity, boolean autoProcess, String operatorId, String operatorName) {
        ScanContext ctx = new ScanContext();
        ctx.scanCode = TextUtils.safeText(params.get("scanCode"));
        ctx.orderNo = TextUtils.safeText(params.get("orderNo"));

        BundleLookupContext lookupContext = BundleLookupContext.from(params);
        ctx.bundle = bundleLookupService.lookup(lookupContext);

        if (ctx.bundle == null || !hasText(ctx.bundle.getId())) {
            ctx.bundle = null;
            if (!hasText(ctx.orderNo)) {
                if (!hasText(ctx.scanCode)) throw new IllegalArgumentException("扫码内容不能为空");
                throw new IllegalStateException("未匹配到菲号");
            }
            ctx.order = resolveOrder(null, ctx.orderNo);
            if (ctx.order == null) throw new IllegalStateException("未匹配到订单");
            if (!hasText(ctx.scanCode)) ctx.scanCode = ctx.orderNo;
            log.info("ORDER模式扫码（无菲号）: orderNo={}", ctx.orderNo);
        } else {
            ctx.order = resolveOrder(ctx.bundle.getProductionOrderId(), null);
            if (ctx.order == null) throw new IllegalStateException("未匹配到订单");
            if (!hasText(ctx.scanCode) && hasText(ctx.bundle.getQrCode())) ctx.scanCode = ctx.bundle.getQrCode();
            if (!hasText(ctx.scanCode)) ctx.scanCode = ctx.orderNo;
        }

        String orderStatus = ctx.order.getStatus() == null ? "" : ctx.order.getStatus().trim();
        if (OrderStatusConstants.isTerminal(orderStatus)) throw new IllegalStateException("订单已终态(" + orderStatus + ")，无法继续扫码");
        if (quantity <= 0) throw new IllegalArgumentException("扫码数量必须大于0");

        executorSupport.validateBundleFactoryAccess(ctx.bundle, "生产");
        return ctx;
    }


    private void resolveProcessStage(ScanContext ctx, Map<String, Object> params, boolean autoProcess) {
        if (autoProcess) {
            ctx.progressStage = processStageDetector.resolveAutoProcessName(ctx.order);
            if (!hasText(ctx.progressStage)) {
                String orderStatus = ctx.order.getStatus() == null ? "" : ctx.order.getStatus().trim();
                if (OrderStatusConstants.isTerminal(orderStatus)) {
                    throw new IllegalStateException("订单已终态，所有工序已完成");
                }
                throw new IllegalStateException("无法自动识别下一工序，请手动选择工序");
            }
        } else {
            ctx.progressStage = TextUtils.safeText(params.get("processName"));
            if (!hasText(ctx.progressStage)) ctx.progressStage = TextUtils.safeText(params.get("progressStage"));
            if (!hasText(ctx.progressStage)) throw new IllegalArgumentException("缺少工序名称");
        }

        if (ctx.bundle == null) {
            boolean isProcurementOrCutting = "采购".equals(ctx.progressStage) || "裁剪".equals(ctx.progressStage)
                    || ProcessSynonymMapping.isEquivalent("采购", ctx.progressStage)
                    || ProcessSynonymMapping.isEquivalent("裁剪", ctx.progressStage);
            if (!isProcurementOrCutting) {
                throw new IllegalStateException("订单码只能用于采购和裁剪阶段，当前工序[" + ctx.progressStage + "]请扫描菲号二维码");
            }
        }

        ctx.childProcessName = ctx.progressStage;
        String parentStage = stageSupport.resolveParentProgressStage(ctx.order.getStyleNo(), ctx.childProcessName);
        if (parentStage != null) {
            log.info("子工序 '{}' 映射到父进度节点 '{}' (styleNo={})", ctx.childProcessName, parentStage, ctx.order.getStyleNo());
            ctx.progressStage = parentStage;
        }
    }

    private void resolveUnitPriceAndProcessCode(ScanContext ctx) {
        ctx.unitPrice = stageSupport.resolveUnitPriceFromTemplate(ctx.order.getStyleNo(), ctx.childProcessName);
        if ((ctx.unitPrice == null || ctx.unitPrice.compareTo(BigDecimal.ZERO) <= 0) && !java.util.Objects.equals(ctx.childProcessName, ctx.progressStage)) {
            ctx.unitPrice = stageSupport.resolveUnitPriceFromTemplate(ctx.order.getStyleNo(), ctx.progressStage);
        }
        if (ctx.unitPrice == null || ctx.unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            log.warn("未找到工序单价: styleNo={}, processName={}, progressStage={}", ctx.order.getStyleNo(), ctx.childProcessName, ctx.progressStage);
            ctx.unitPrice = BigDecimal.ZERO;
        }
        ctx.unitPriceZero = ctx.unitPrice.compareTo(BigDecimal.ZERO) <= 0;

        ctx.processCode = resolveProcessCodeFromTemplate(ctx.order.getStyleNo(), ctx.childProcessName);
        if (!hasText(ctx.processCode)) {
            ctx.processCode = resolveProcessCodeFromOrderWorkflow(ctx.order, ctx.childProcessName);
        }
        if (!hasText(ctx.processCode)) {
            ctx.processCode = resolveProcessCodeFromOrderWorkflow(ctx.order, ctx.progressStage);
        }
        if (!hasText(ctx.processCode)) ctx.processCode = ctx.childProcessName;
    }

    private Map<String, Object> checkDuplicateScan(ScanContext ctx, String scanType, String operatorId) {
        String dupCode = ctx.scanCode;
        if (!hasText(dupCode) && ctx.bundle != null) dupCode = TextUtils.safeText(ctx.bundle.getQrCode());
        if (!hasText(dupCode)) dupCode = ctx.orderNo;

        Integer bundleQuantity = ctx.bundle != null ? ctx.bundle.getQuantity() : 0;
        if (duplicateScanPreventer.hasRecentDuplicateScan(dupCode, scanType, bundleQuantity, null, ctx.processCode, operatorId)) {
            Map<String, Object> dup = new HashMap<>();
            dup.put("success", true);
            dup.put("message", "扫码过快，已自动忽略重复提交");
            dup.put("duplicateIgnored", true);
            return dup;
        }
        return null;
    }

    private void handleFinancialRiskControl(ScanRecord sr, String operatorId, String operatorName, int quantity, String processCode) {
        if (sr.getTotalAmount() == null || sr.getTotalAmount().doubleValue() <= 1000.0) return;
        try {
            duplicateScanPreventer.validateReasonableOutput(operatorId, quantity, 10);
        } catch (IllegalStateException e) {
            sr.setScanResult("failure");
            sr.setRemark("风控拦截：" + e.getMessage());
            scanRecordService.saveScanRecord(sr);
            pushRiskAlert(operatorName, quantity, processCode, sr.getTotalAmount());
            throw new IllegalStateException("AI 财务风控拦截：单次扫码金额/数量过大，请拆分批次或联系厂长核实。");
        }
    }

    private void pushRiskAlert(String operatorName, int quantity, String processCode, BigDecimal totalAmount) {
        com.fashion.supplychain.intelligence.dto.TraceableAdvice advice = com.fashion.supplychain.intelligence.dto.TraceableAdvice.builder()
                .traceId(java.util.UUID.randomUUID().toString())
                .title("🚨 财务风控：检测到异常高产/高薪扫码")
                .summary("工人 " + operatorName + " 提交了 " + quantity + " 件 " + processCode + " 扫码，单次计件金额高达 " + totalAmount + " 元。")
                .reasoningChain(java.util.List.of(
                    "本次提交数量：" + quantity + " 件",
                    "本次计件金额：" + totalAmount + " 元",
                    "判定结果：超出系统设定的单笔安全阈值，已自动拦截并冻结计件。"))
                .confidenceScore(5)
                .proposedActions(java.util.List.of(
                    com.fashion.supplychain.intelligence.dto.TraceableAdvice.ProposedAction.builder()
                        .label("立即核实并警告").actionCommand("send_notification")
                        .actionParams(Map.of("toUser", operatorName, "content", "您的扫码数据异常，已被系统拦截，请联系厂长。")).build(),
                    com.fashion.supplychain.intelligence.dto.TraceableAdvice.ProposedAction.builder()
                        .label("忽略").actionCommand("IGNORE").build()))
                .build();
        String userId = com.fashion.supplychain.common.UserContext.userId();
        if (userId != null) {
            webSocketService.sendToUser(userId, com.fashion.supplychain.websocket.enums.WebSocketMessageType.TRACEABLE_ADVICE, advice);
        }
    }

    private void updateProcessTracking(CuttingBundle bundle, String childProcessName, String progressStage, String processCode, String operatorId, String operatorName, String scanRecordId) {
        if (bundle == null || !hasText(bundle.getId())) return;
        try {
            boolean updated = processTrackingOrchestrator.updateScanRecord(bundle.getId(), childProcessName, operatorId, operatorName, scanRecordId);
            if (!updated && hasText(progressStage) && !childProcessName.equals(progressStage)) {
                updated = processTrackingOrchestrator.updateScanRecord(bundle.getId(), progressStage, operatorId, operatorName, scanRecordId);
                if (updated) log.info("工序跟踪记录更新成功（回退到父节点名）: bundleId={}, progressStage={}", bundle.getId(), progressStage);
            }
            if (updated) log.info("工序跟踪记录更新成功: bundleId={}, processCode={}, progressStage={}", bundle.getId(), processCode, progressStage);
            else log.warn("工序跟踪记录未找到（不阻断扫码）: bundleId={}, processCode={}, progressStage={}", bundle.getId(), processCode, progressStage);
        } catch (BusinessException be) {
            log.warn("工序跟踪拒绝领取（不阻断扫码）: bundleId={}, processCode={}, msg={}", bundle.getId(), processCode, be.getMessage());
        } catch (IllegalStateException ise) {
            log.warn("工序跟踪状态冲突（不阻断扫码）: bundleId={}, processCode={}, msg={}", bundle.getId(), processCode, ise.getMessage());
        } catch (Exception e) {
            log.error("工序跟踪记录更新失败（非业务异常）: bundleId={}, processCode={}", bundle.getId(), processCode, e);
        }
    }

    private Map<String, Object> buildSuccessResult(ScanRecord sr, ScanContext ctx, boolean isCutting) {
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        String bundleNoStr = ctx.bundle != null && ctx.bundle.getBundleNo() != null ? String.valueOf(ctx.bundle.getBundleNo()) : "";
        String displayProcessName = ctx.processCode != null ? ctx.processCode : (ctx.progressStage != null ? ctx.progressStage : "");
        result.put("message", "扫码成功" + (displayProcessName.isEmpty() ? "" : " · " + displayProcessName) + (bundleNoStr.isEmpty() ? "" : " · 菲号" + bundleNoStr));
        result.put("scanRecord", sr);
        result.put("orderInfo", buildOrderInfo(ctx.order));
        result.put("childProcessName", ctx.childProcessName);
        result.put("parentProgressStage", ctx.progressStage);

        String nextStage;
        switch (sr.getScanType() != null ? sr.getScanType().trim().toLowerCase() : "") {
            case "cutting": nextStage = "production"; break;
            case "production": nextStage = "quality"; break;
            case "quality": nextStage = "warehouse"; break;
            default: nextStage = null;
        }
        if (hasText(nextStage)) {
            result.put("nextScanType", nextStage);
            result.put("nextStageHint", "下一环节: " + nextStage);
        }
        if (ctx.unitPriceZero) result.put("unitPriceHint", "该工序未设置单价，扫码后工资为0，请联系管理员设置单价");
        if ("采购".equals(ctx.progressStage)) attachMaterialPurchaseList(result, ctx.order);
        if (isCutting) result.put("cuttingBundle", ctx.bundle);
        return result;
    }

    private void validateSplitGuard(ScanContext ctx) {
        if (ctx.bundle == null || !"split_parent".equals(ctx.bundle.getSplitStatus()) || ctx.bundle.getSplitProcessOrder() == null) return;
        List<ProductionProcessTracking> bundleTrackings = trackingService.getByBundleId(ctx.bundle.getId());
        boolean hasActiveTracking = bundleTrackings.stream()
                .anyMatch(t -> (java.util.Objects.equals(ctx.childProcessName, t.getProcessName()) || java.util.Objects.equals(ctx.progressStage, t.getProcessName()))
                        && !"split_archived".equals(t.getScanStatus()));
        if (!hasActiveTracking) {
            String splitInfo = ctx.bundle.getSplitProcessName() != null
                    ? "该菲号在「" + ctx.bundle.getSplitProcessName() + "」工序已拆分，请扫描子菲号"
                    : "该菲号已拆分，请扫描子菲号";
            throw new BusinessException(splitInfo);
        }
    }

    private String resolveColor(java.util.function.Function<String, String> colorResolver, CuttingBundle bundle, ProductionOrder order) {
        String color = colorResolver.apply(null);
        if (!hasText(color) && bundle != null) color = TextUtils.safeText(bundle.getColor());
        if (!hasText(color) && order != null) color = TextUtils.safeText(order.getColor());
        return color;
    }

    private String resolveSize(java.util.function.Function<String, String> sizeResolver, CuttingBundle bundle, ProductionOrder order) {
        String size = sizeResolver.apply(null);
        if (!hasText(size) && bundle != null) size = TextUtils.safeText(bundle.getSize());
        if (!hasText(size) && order != null) size = TextUtils.safeText(order.getSize());
        return size;
    }

    private LocalDateTime parseClientScanTime(Map<String, Object> params) {
        try {
            String scanTimeStr = TextUtils.safeText(params.get("scanTime"));
            if (hasText(scanTimeStr)) return ParamUtils.parseDateTime(scanTimeStr);
        } catch (Exception e) {
            log.warn("解析客户端scanTime失败: {}", params.get("scanTime"));
        }
        return null;
    }

    static class ScanContext {
        String scanCode;
        String orderNo;
        CuttingBundle bundle;
        ProductionOrder order;
        String progressStage;
        String childProcessName;
        String processCode;
        BigDecimal unitPrice;
        boolean unitPriceZero;
    }

    private Map<String, Object> tryUpdateExistingBundleScanRecord(
            String requestId, String scanCode, CuttingBundle bundle, ProductionOrder order,
            String scanType, String progressStage, String processCode, String childProcessName, int quantity,
            BigDecimal unitPrice, String operatorId, String operatorName, String color, String size,
            String remark, boolean includeBundle) {
        if (bundle == null || !hasText(bundle.getId()) || order == null || !hasText(order.getId())) return null;
        try {
            ScanRecord existing = scanRecordService.getOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getCuttingBundleId, bundle.getId())
                    .eq(ScanRecord::getScanType, scanType)
                    .eq(ScanRecord::getScanResult, "success")
                    .gt(ScanRecord::getQuantity, 0)
                    .eq(ScanRecord::getProcessCode, processCode)
                    .last("limit 1"));
            if (existing == null || !hasText(existing.getId())) return null;

            assertSameOperator(existing, operatorId, operatorName, processCode);

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

            ScanRecord patch = buildScanRecordPatch(existing.getId(), scanCode, order, bundle,
                    color, size, nextQty, unitPrice, processCode, progressStage, childProcessName,
                    operatorId, operatorName, scanType, remark);
            if (skuService != null) skuService.attachProcessUnitPrice(patch);
            validateScanRecordForSave(patch);
            scanRecordService.updateById(patch);
            productionOrderService.recomputeProgressAsync(order.getId());

            ScanRecord returned = buildScanRecordPatch(existing.getId(), scanCode, order, bundle,
                    color, size, nextQty, unitPrice, processCode, progressStage, childProcessName,
                    operatorId, operatorName, scanType, remark);
            returned.setRequestId(requestId);

            Map<String, Object> result = new HashMap<>();
            result.put("success", true); result.put("message", "已扫码更新"); result.put("scanRecord", returned);
            if (includeBundle) result.put("cuttingBundle", bundle);
            return result;
        } catch (IllegalStateException ise) {
            log.warn("领取冲突（他人已领取）: orderId={}, processCode={}, msg={}", order.getId(), processCode, ise.getMessage());
            throw ise;
        } catch (Exception e) {
            log.warn("尝试更新已有扫码记录失败: orderId={}, requestId={}, scanCode={}", order.getId(), requestId, scanCode, e);
            return null;
        }
    }

    private void assertSameOperator(ScanRecord existing, String operatorId, String operatorName, String processCode) {
        String existingOperatorId = existing.getOperatorId() == null ? null : existing.getOperatorId().trim();
        String existingOperatorName = existing.getOperatorName() == null ? null : existing.getOperatorName().trim();
        boolean isSameOperator = false;
        if (hasText(operatorId) && hasText(existingOperatorId)) isSameOperator = operatorId.equals(existingOperatorId);
        else if (hasText(operatorName) && hasText(existingOperatorName)) isSameOperator = operatorName.equals(existingOperatorName);
        if (!isSameOperator) {
            String otherName = hasText(existingOperatorName) ? existingOperatorName : "他人";
            throw new IllegalStateException("该菲号「" + processCode + "」环节已被「" + otherName + "」领取，无法重复操作");
        }
    }

    private ScanRecord buildScanRecordPatch(String id, String scanCode, ProductionOrder order, CuttingBundle bundle,
                                             String color, String size, int nextQty, BigDecimal unitPrice,
                                             String processCode, String progressStage, String childProcessName,
                                             String operatorId, String operatorName, String scanType, String remark) {
        ScanRecord sr = new ScanRecord();
        sr.setId(id); sr.setScanCode(scanCode);
        sr.setOrderId(order.getId()); sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId()); sr.setStyleNo(order.getStyleNo());
        sr.setColor(color); sr.setSize(size); sr.setQuantity(nextQty);
        sr.setUnitPrice(unitPrice); sr.setTotalAmount(computeTotalAmount(unitPrice, nextQty));
        sr.setProcessCode(processCode); sr.setProgressStage(progressStage); sr.setProcessName(childProcessName);
        sr.setOperatorId(operatorId); sr.setOperatorName(operatorName);
        sr.setScanTime(LocalDateTime.now()); sr.setScanType(scanType); sr.setScanResult("success");
        sr.setRemark(remark); sr.setCuttingBundleId(bundle.getId());
        sr.setCuttingBundleNo(bundle.getBundleNo()); sr.setCuttingBundleQrCode(bundle.getQrCode());
        sr.setUpdateTime(LocalDateTime.now());
        return sr;
    }

    private String resolveProcessCodeFromTemplate(String styleNo, String processName) {
        String sn = hasText(styleNo) ? styleNo.trim() : null;
        String pn = hasText(processName) ? processName.trim() : null;
        if (!hasText(sn) || !hasText(pn)) return null;
        try {
            List<Map<String, Object>> nodes = templateLibraryService.resolveProgressNodeUnitPrices(sn);
            if (nodes == null || nodes.isEmpty()) return null;
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

    @SuppressWarnings("unchecked")
    private String resolveProcessCodeFromOrderWorkflow(ProductionOrder order, String processName) {
        if (order == null || !hasText(processName)) return null;
        String pn = processName.trim();
        String workflowJson = order.getProgressWorkflowJson();
        if (!hasText(workflowJson)) return null;
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            Map<String, Object> workflow = mapper.readValue(workflowJson, Map.class);
            Object nodesObj = workflow.get("nodes");
            if (!(nodesObj instanceof List)) return null;
            List<Map<String, Object>> nodeList = (List<Map<String, Object>>) nodesObj;
            for (Map<String, Object> node : nodeList) {
                String name = String.valueOf(node.getOrDefault("name", "")).trim();
                if (pn.equals(name)) {
                    String id = String.valueOf(node.getOrDefault("id", "")).trim();
                    if (hasText(id) && !id.equals(name)) return id;
                }
            }
        } catch (Exception e) {
            log.warn("从订单workflow解析工序编号失败: orderNo={}, processName={}", order.getOrderNo(), pn, e);
        }
        return null;
    }

    private void attachMaterialPurchaseList(Map<String, Object> result, ProductionOrder order) {
        if (result == null || order == null || !hasText(order.getId())) return;
        try {
            if (materialPurchaseService != null) {
                List<MaterialPurchase> list = materialPurchaseService.list(
                        new LambdaQueryWrapper<MaterialPurchase>()
                                .eq(MaterialPurchase::getOrderId, order.getId())
                                .eq(MaterialPurchase::getDeleteFlag, 0)
                                .orderByAsc(MaterialPurchase::getCreateTime));
                if (list != null && !list.isEmpty()) result.put("materialPurchases", list);
            }
        } catch (Exception e) {
            log.warn("获取面料采购清单失败: orderId={}", order.getId(), e);
        }
    }

    private ScanRecord buildProductionRecord(String requestId, String scanCode, CuttingBundle bundle,
                                            ProductionOrder order, String scanType, String progressStage,
                                            String processCode, String processName, int quantity, BigDecimal unitPrice,
                                            String operatorId, String operatorName, String color, String size,
                                            String remark, LocalDateTime clientScanTime) {
        ScanRecord sr = new ScanRecord();
        sr.setRequestId(requestId); sr.setScanCode(scanCode); sr.setOrderId(order.getId()); sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId()); sr.setStyleNo(order.getStyleNo()); sr.setTenantId(order.getTenantId());
        sr.setColor(color); sr.setSize(size); sr.setQuantity(quantity); sr.setUnitPrice(unitPrice);
        sr.setTotalAmount(computeTotalAmount(unitPrice, quantity)); sr.setProcessCode(processCode);
        sr.setProgressStage(progressStage); sr.setProcessName(processName);
        sr.setOperatorId(operatorId); sr.setOperatorName(operatorName);
        sr.setFactoryId(com.fashion.supplychain.common.UserContext.factoryId());

        LocalDateTime now = LocalDateTime.now();
        if (clientScanTime != null && clientScanTime.isAfter(now.minusDays(7)) && !clientScanTime.isAfter(now.plusMinutes(5))) {
            sr.setScanTime(clientScanTime);
        } else {
            if (clientScanTime != null) log.warn("客户端scanTime超出合法范围，已使用服务器时间: clientTime={}", clientScanTime);
            sr.setScanTime(now);
        }
        sr.setScanType(scanType); sr.setScanResult("success"); sr.setRemark(remark);
        if (bundle != null) {
            sr.setCuttingBundleId(bundle.getId()); sr.setCuttingBundleNo(bundle.getBundleNo()); sr.setCuttingBundleQrCode(bundle.getQrCode());
        }
        if (skuService != null) skuService.attachProcessUnitPrice(sr);
        return sr;
    }

    private ProductionOrder resolveOrder(String orderId, String orderNo) {
        String oid = hasText(orderId) ? orderId.trim() : null;
        if (hasText(oid)) {
            ProductionOrder o = productionOrderService.getById(oid);
            if (o == null || o.getDeleteFlag() == null || o.getDeleteFlag() != 0) return null;
            return o;
        }
        String on = hasText(orderNo) ? orderNo.trim() : null;
        if (!hasText(on)) return null;
        return productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getOrderNo, on).eq(ProductionOrder::getDeleteFlag, 0).last("limit 1"));
    }

    private void validateScanRecordForSave(ScanRecord sr) {
        if (sr == null) return;
        ensureMaxLen("扫码内容", sr.getScanCode(), 200); ensureMaxLen("备注", sr.getRemark(), 255);
        ensureMaxLen("进度环节", sr.getProgressStage(), 100); ensureMaxLen("工序名称", sr.getProcessName(), 100);
        ensureMaxLen("工序编码", sr.getProcessCode(), 50); ensureMaxLen("操作员名称", sr.getOperatorName(), 50);
        ensureMaxLen("扫码类型", sr.getScanType(), 20); ensureMaxLen("扫码结果", sr.getScanResult(), 20);
        ensureMaxLen("裁剪扎号二维码", sr.getCuttingBundleQrCode(), 200); ensureMaxLen("订单号", sr.getOrderNo(), 50);
        ensureMaxLen("款号", sr.getStyleNo(), 50); ensureMaxLen("颜色", sr.getColor(), 50);
        ensureMaxLen("尺码", sr.getSize(), 50); ensureMaxLen("requestId", sr.getRequestId(), 64);
        String st = hasText(sr.getScanType()) ? sr.getScanType().trim().toLowerCase() : "";
        if (("production".equals(st) || "quality".equals(st) || "warehouse".equals(st)) && skuService != null) {
            if (!skuService.validateSKU(sr)) throw new IllegalStateException("SKU信息无效");
        }
    }

    private void ensureMaxLen(String fieldName, String value, int maxLen) {
        if (!hasText(value) || maxLen <= 0) return;
        if (value.trim().length() > maxLen) throw new IllegalArgumentException(fieldName + "过长（最多" + maxLen + "字符）");
    }

    private BigDecimal computeTotalAmount(BigDecimal unitPrice, int quantity) {
        BigDecimal up = unitPrice == null ? BigDecimal.ZERO : unitPrice;
        return up.multiply(BigDecimal.valueOf(Math.max(0, quantity))).setScale(2, RoundingMode.HALF_UP);
    }

    private Map<String, Object> buildOrderInfo(ProductionOrder order) {
        Map<String, Object> info = new HashMap<>();
        info.put("orderNo", order.getOrderNo()); info.put("styleNo", order.getStyleNo());
        if (hasText(order.getStyleId())) {
            try {
                com.fashion.supplychain.style.entity.StyleInfo si = styleInfoService.getById(order.getStyleId());
                if (si != null) {
                    if (hasText(si.getDescription())) info.put("description", si.getDescription());
                    if (hasText(si.getCover())) {
                        info.put("coverImage", si.getCover());
                        info.put("styleImage", si.getCover());
                    }
                }
            } catch (Exception e) { log.warn("buildOrderInfo查询款式信息失败: styleId={}", order.getStyleId(), e); }
            try {
                Long styleIdLong = null;
                try { styleIdLong = Long.valueOf(order.getStyleId()); } catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
                if (styleIdLong != null) {
                    java.util.List<com.fashion.supplychain.style.entity.SecondaryProcess> processes = secondaryProcessService.listByStyleId(styleIdLong);
                    if (processes != null && !processes.isEmpty()) info.put("secondaryProcesses", processes);
                }
            } catch (Exception e) { log.warn("buildOrderInfo查询二次工艺失败: styleId={}", order.getStyleId(), e); }
        }
        return info;
    }

    private boolean hasText(String str) {
        return ScanExecutorSupport.hasText(str);
    }
}
