package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.util.QrCodeSigner;
import com.fashion.supplychain.production.dto.CuttingBundleSplitRollbackRequest;
import com.fashion.supplychain.production.dto.CuttingBundleSplitTransferRequest;
import com.fashion.supplychain.production.dto.CuttingBundleSplitTransferResponse;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingBundleSplitLog;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingBundleSplitLogService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.websocket.service.WebSocketService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class CuttingBundleSplitTransferOrchestrator {

    @Autowired
    private CuttingBundleService cuttingBundleService;
    @Autowired
    private ProductionProcessTrackingService trackingService;
    @Autowired
    private ScanRecordService scanRecordService;
    @Autowired
    private CuttingBundleSplitLogService splitLogService;
    @Autowired
    private QrCodeSigner qrCodeSigner;
    @Autowired
    @Lazy
    private WebSocketService webSocketService;

    @Transactional(rollbackFor = Exception.class)
    public CuttingBundleSplitTransferResponse splitAndTransfer(CuttingBundleSplitTransferRequest request) {
        CuttingBundle source = resolveSource(request);
        validateRequest(source, request);
        List<ProductionProcessTracking> sourceTrackings = trackingService.getByBundleId(source.getId()).stream()
                .sorted(Comparator.comparing(ProductionProcessTracking::getProcessOrder, Comparator.nullsLast(Integer::compareTo)))
                .collect(Collectors.toList());
        ProductionProcessTracking currentTracking = sourceTrackings.stream()
                .filter(item -> request.getCurrentProcessName().trim().equals(item.getProcessName()))
                .findFirst()
                .orElseThrow(() -> new BusinessException("未找到当前工序记录"));
        int currentOrder = currentTracking.getProcessOrder() == null ? Integer.MAX_VALUE : currentTracking.getProcessOrder();
        if (sourceTrackings.stream().anyMatch(item -> (item.getProcessOrder() == null ? Integer.MAX_VALUE : item.getProcessOrder()) > currentOrder
                && "scanned".equals(item.getScanStatus()))) {
            throw new BusinessException("后续工序已存在扫码记录，不能再拆菲转派");
        }
        List<ScanRecord> sourceScans = scanRecordService.listByCondition(source.getProductionOrderId(), source.getId(), null, "success", null);
        Map<String, ScanRecord> scanByProcess = sourceScans.stream().collect(Collectors.toMap(
                item -> StringUtils.hasText(item.getProcessCode()) ? item.getProcessCode() : item.getProcessName(),
                Function.identity(),
                (a, b) -> a,
                java.util.LinkedHashMap::new));
        if (sourceScans.stream().anyMatch(item -> StringUtils.hasText(item.getPayrollSettlementId())
                || "settled".equalsIgnoreCase(item.getSettlementStatus()))) {
            throw new BusinessException("该菲号已有工资结算记录，不能拆菲转派");
        }
        String rootBundleId = StringUtils.hasText(source.getRootBundleId()) ? source.getRootBundleId() : source.getId();
        int maxSeq = cuttingBundleService.lambdaQuery().eq(CuttingBundle::getRootBundleId, rootBundleId)
                .orderByDesc(CuttingBundle::getSplitSeq).last("limit 1").oneOpt().map(item -> item.getSplitSeq() == null ? 0 : item.getSplitSeq()).orElse(0);
        String splitProcessName = currentTracking.getProcessName();
        CuttingBundle completedBundle = buildChildBundle(source, request.getCompletedQuantity(), maxSeq + 1, request.getToWorkerId(), request.getToWorkerName(), false, splitProcessName, currentOrder);
        CuttingBundle transferBundle = buildChildBundle(source, request.getTransferQuantity(), maxSeq + 2, request.getToWorkerId(), request.getToWorkerName(), true, splitProcessName, currentOrder);
        cuttingBundleService.saveBatch(List.of(completedBundle, transferBundle));
        persistTrackingAndScans(source, completedBundle, transferBundle, sourceTrackings, scanByProcess, currentOrder, request);
        archiveSourceBundle(source, splitProcessName, currentOrder);
        splitLogService.save(buildSplitLog(source, completedBundle, transferBundle, request));
        CuttingBundleSplitTransferResponse response = buildResponse(source, rootBundleId, request, completedBundle, transferBundle);
        registerPostCommitNotification(source, request, completedBundle, transferBundle);
        return response;
    }

    public CuttingBundleSplitTransferResponse queryFamily(String bundleId) {
        CuttingBundle current = cuttingBundleService.getById(bundleId);
        if (current == null) {
            throw new BusinessException("未找到对应菲号");
        }
        String rootBundleId = StringUtils.hasText(current.getRootBundleId()) ? current.getRootBundleId() : current.getId();
        List<CuttingBundle> family = cuttingBundleService.lambdaQuery().eq(CuttingBundle::getRootBundleId, rootBundleId)
                .orderByAsc(CuttingBundle::getSplitSeq).list();
        CuttingBundle root = family.stream().filter(item -> rootBundleId.equals(item.getId())).findFirst().orElse(current);
        CuttingBundleSplitTransferResponse response = new CuttingBundleSplitTransferResponse();
        response.setSuccess(true);
        response.setRootBundleId(rootBundleId);
        response.setRootBundleLabel(resolveBundleLabel(root));
        response.setOrderNo(root.getProductionOrderNo());
        response.setSourceBundleId(current.getId());
        response.setSourceBundleLabel(resolveBundleLabel(current));
        response.setBundles(toBundleNodes(family));
        return response;
    }

    @Transactional(rollbackFor = Exception.class)
    public CuttingBundleSplitTransferResponse rollbackSplit(CuttingBundleSplitRollbackRequest request) {
        CuttingBundle current = resolveBundle(request.getBundleId(), request.getQrCode(), request.getOrderNo(), request.getBundleNo());
        CuttingBundle source = resolveRollbackSource(current);
        CuttingBundleSplitLog splitLog = splitLogService.lambdaQuery()
                .eq(CuttingBundleSplitLog::getSourceBundleId, source.getId())
                .isNull(CuttingBundleSplitLog::getRollbackTime)
                .orderByDesc(CuttingBundleSplitLog::getCreateTime)
                .last("limit 1")
                .one();
        if (splitLog == null) {
            throw new BusinessException("未找到可撤回的拆菲记录");
        }
        List<CuttingBundle> childBundles = cuttingBundleService.lambdaQuery()
                .eq(CuttingBundle::getParentBundleId, source.getId())
                .eq(CuttingBundle::getSplitStatus, "split_child")
                .list();
        if (childBundles.size() < 2) {
            throw new BusinessException("拆菲子菲号不完整，无法撤回");
        }
        Map<String, CuttingBundle> childById = childBundles.stream().collect(Collectors.toMap(CuttingBundle::getId, Function.identity()));
        CuttingBundle completedBundle = childById.get(splitLog.getCompletedBundleId());
        CuttingBundle transferBundle = childById.get(splitLog.getTransferBundleId());
        if (completedBundle == null || transferBundle == null) {
            throw new BusinessException("未找到拆菲子菲号，无法撤回");
        }
        List<ProductionProcessTracking> sourceTrackings = trackingService.getByBundleId(source.getId()).stream()
                .sorted(Comparator.comparing(ProductionProcessTracking::getProcessOrder, Comparator.nullsLast(Integer::compareTo)))
                .collect(Collectors.toList());
        ProductionProcessTracking currentTracking = sourceTrackings.stream()
                .filter(item -> splitLog.getCurrentProcessName().equals(item.getProcessName()))
                .findFirst()
                .orElseThrow(() -> new BusinessException("原菲号当前工序记录不存在，无法撤回"));
        int currentOrder = currentTracking.getProcessOrder() == null ? Integer.MAX_VALUE : currentTracking.getProcessOrder();
        validateRollbackChildren(completedBundle, transferBundle, currentOrder);
        restoreSourceTrackings(sourceTrackings, currentOrder);
        restoreSourceScans(source);
        trackingService.removeByIds(trackingService.lambdaQuery()
                .in(ProductionProcessTracking::getCuttingBundleId, List.of(completedBundle.getId(), transferBundle.getId()))
                .list()
                .stream()
                .map(ProductionProcessTracking::getId)
                .collect(Collectors.toList()));
        scanRecordService.removeByIds(scanRecordService.lambdaQuery()
                .in(ScanRecord::getCuttingBundleId, List.of(completedBundle.getId(), transferBundle.getId()))
                .list()
                .stream()
                .map(ScanRecord::getId)
                .collect(Collectors.toList()));
        cuttingBundleService.removeByIds(List.of(completedBundle.getId(), transferBundle.getId()));
        restoreSourceBundle(source, splitLog, currentOrder, sourceTrackings);
        splitLog.setRollbackTime(LocalDateTime.now());
        splitLog.setRollbackBy(StringUtils.hasText(UserContext.username()) ? UserContext.username() : "system");
        splitLog.setRollbackReason(StringUtils.hasText(request.getReason()) ? request.getReason().trim() : "撤销拆菲转派");
        splitLog.setUpdater(splitLog.getRollbackBy());
        splitLogService.updateById(splitLog);

        CuttingBundleSplitTransferResponse response = new CuttingBundleSplitTransferResponse();
        response.setSuccess(true);
        response.setAction("rollback_split");
        response.setMessage("拆菲已撤回，数据已归回原有菲号");
        response.setRootBundleId(StringUtils.hasText(source.getRootBundleId()) ? source.getRootBundleId() : source.getId());
        response.setRootBundleLabel(resolveBundleLabel(source));
        response.setOrderNo(source.getProductionOrderNo());
        response.setSourceBundleId(source.getId());
        response.setSourceBundleLabel(resolveBundleLabel(source));
        response.setCurrentProcessName(splitLog.getCurrentProcessName());
        response.setReason(splitLog.getRollbackReason());
        response.setBundles(toBundleNodes(List.of(source)));
        return response;
    }

    private void persistTrackingAndScans(CuttingBundle source, CuttingBundle completedBundle, CuttingBundle transferBundle,
                                         List<ProductionProcessTracking> sourceTrackings, Map<String, ScanRecord> scanByProcess,
                                         int currentOrder, CuttingBundleSplitTransferRequest request) {
        List<ProductionProcessTracking> newTrackings = new ArrayList<>();
        List<ProductionProcessTracking> archivedTrackings = new ArrayList<>();
        List<ScanRecord> clonedScans = new ArrayList<>();
        List<ScanRecord> archivedScans = new ArrayList<>();
        String currentUser = StringUtils.hasText(UserContext.username()) ? UserContext.username() : "system";
        for (ProductionProcessTracking sourceTracking : sourceTrackings) {
            int order = sourceTracking.getProcessOrder() == null ? Integer.MAX_VALUE : sourceTracking.getProcessOrder();
            if (order > currentOrder) {
                // 拆分只影响当前及之前的工序，后续工序保留在父菲号上不动
                continue;
            }
            boolean beforeCurrent = order < currentOrder;
            boolean current = order == currentOrder;
            newTrackings.add(cloneTracking(sourceTracking, completedBundle, request.getCompletedQuantity(), beforeCurrent || current, sourceTracking.getOperatorId(), sourceTracking.getOperatorName()));
            newTrackings.add(cloneTracking(sourceTracking, transferBundle, request.getTransferQuantity(), beforeCurrent, beforeCurrent ? sourceTracking.getOperatorId() : request.getToWorkerId(), beforeCurrent ? sourceTracking.getOperatorName() : request.getToWorkerName()));
            sourceTracking.setScanStatus("split_archived");
            sourceTracking.setUpdater(currentUser);
            archivedTrackings.add(sourceTracking);
            ScanRecord sourceScan = scanByProcess.get(StringUtils.hasText(sourceTracking.getProcessCode()) ? sourceTracking.getProcessCode() : sourceTracking.getProcessName());
            if (sourceScan != null && order <= currentOrder) {
                sourceScan.setScanResult("split_archived");
                sourceScan.setRemark(appendRemark(sourceScan.getRemark(), "拆菲转派已归档"));
                archivedScans.add(sourceScan);
                clonedScans.add(cloneScan(sourceScan, completedBundle, request.getCompletedQuantity(), sourceTracking.getProcessName(), sourceTracking.getProcessCode(), sourceTracking.getOperatorId(), sourceTracking.getOperatorName()));
                if (beforeCurrent) {
                    clonedScans.add(cloneScan(sourceScan, transferBundle, request.getTransferQuantity(), sourceTracking.getProcessName(), sourceTracking.getProcessCode(), sourceTracking.getOperatorId(), sourceTracking.getOperatorName()));
                }
            }
        }
        trackingService.saveBatch(newTrackings);
        trackingService.updateBatchById(archivedTrackings);
        if (!clonedScans.isEmpty()) {
            scanRecordService.saveBatch(clonedScans);
        }
        if (!archivedScans.isEmpty()) {
            scanRecordService.updateBatchById(archivedScans);
        }
    }

    private CuttingBundle buildChildBundle(CuttingBundle source, Integer quantity, int splitSeq,
                                             String toWorkerId, String toWorkerName, boolean transferChild,
                                             String splitProcessName, Integer splitProcessOrder) {
        CuttingBundle target = new CuttingBundle();
        target.setId(UUID.randomUUID().toString().replace("-", ""));
        target.setRootBundleId(StringUtils.hasText(source.getRootBundleId()) ? source.getRootBundleId() : source.getId());
        target.setParentBundleId(source.getId());
        target.setSourceBundleId(source.getId());
        target.setProductionOrderId(source.getProductionOrderId());
        target.setProductionOrderNo(source.getProductionOrderNo());
        target.setStyleId(source.getStyleId());
        target.setStyleNo(source.getStyleNo());
        target.setColor(source.getColor());
        target.setSize(source.getSize());
        target.setBundleNo(source.getBundleNo());
        target.setBundleLabel(source.getBundleNo() + "-" + String.format("%02d", splitSeq));
        target.setQuantity(quantity);
        target.setBedNo(source.getBedNo());
        target.setQrCode(buildQrCode(source, quantity));
        target.setStatus(transferChild ? "pending" : "completed");
        target.setSplitStatus("split_child");
        target.setSplitSeq(splitSeq);
        target.setSplitProcessName(splitProcessName);
        target.setSplitProcessOrder(splitProcessOrder);
        target.setOperatorId(toWorkerId);
        target.setOperatorName(toWorkerName);
        target.setTenantId(UserContext.tenantId());
        return target;
    }

    private ProductionProcessTracking cloneTracking(ProductionProcessTracking source, CuttingBundle target, Integer quantity,
                                                    boolean scanned, String operatorId, String operatorName) {
        ProductionProcessTracking tracking = new ProductionProcessTracking();
        tracking.setId(UUID.randomUUID().toString().replace("-", ""));
        tracking.setProductionOrderId(source.getProductionOrderId());
        tracking.setProductionOrderNo(source.getProductionOrderNo());
        tracking.setCuttingBundleId(target.getId());
        tracking.setBundleNo(target.getBundleNo());
        tracking.setSku(source.getSku());
        tracking.setColor(source.getColor());
        tracking.setSize(source.getSize());
        tracking.setQuantity(quantity);
        tracking.setProcessCode(source.getProcessCode());
        tracking.setProcessName(source.getProcessName());
        tracking.setProcessOrder(source.getProcessOrder());
        tracking.setUnitPrice(source.getUnitPrice());
        tracking.setScanStatus(scanned ? "scanned" : "pending");
        tracking.setScanTime(scanned ? LocalDateTime.now() : null);
        tracking.setOperatorId(scanned ? operatorId : null);
        tracking.setOperatorName(scanned ? operatorName : null);
        tracking.setSettlementAmount(scanned && source.getUnitPrice() != null ? source.getUnitPrice().multiply(BigDecimal.valueOf(quantity)) : null);
        tracking.setIsSettled(false);
        tracking.setCreator(StringUtils.hasText(UserContext.username()) ? UserContext.username() : "system");
        tracking.setTenantId(UserContext.tenantId());
        return tracking;
    }

    private ScanRecord cloneScan(ScanRecord source, CuttingBundle target, Integer quantity, String processName, String processCode,
                                 String operatorId, String operatorName) {
        ScanRecord record = new ScanRecord();
        record.setId(UUID.randomUUID().toString().replace("-", ""));
        record.setScanCode(target.getQrCode());
        record.setRequestId(source.getRequestId());
        record.setOrderId(source.getOrderId());
        record.setOrderNo(source.getOrderNo());
        record.setStyleId(source.getStyleId());
        record.setStyleNo(source.getStyleNo());
        record.setColor(source.getColor());
        record.setSize(source.getSize());
        record.setQuantity(quantity);
        record.setUnitPrice(source.getUnitPrice());
        record.setTotalAmount(source.getUnitPrice() != null
                ? source.getUnitPrice().multiply(BigDecimal.valueOf(quantity))
                : (source.getTotalAmount() != null && source.getQuantity() != null && source.getQuantity() > 0
                        ? source.getTotalAmount().multiply(BigDecimal.valueOf(quantity)).divide(BigDecimal.valueOf(source.getQuantity()), 2, java.math.RoundingMode.HALF_UP)
                        : source.getTotalAmount()));
        record.setReceiveTime(source.getReceiveTime());
        record.setConfirmTime(source.getConfirmTime());
        record.setSettlementStatus("pending");
        record.setProcessCode(processCode);
        record.setProgressStage(processName);
        record.setProcessName(processName);
        record.setOperatorId(operatorId);
        record.setOperatorName(operatorName);
        record.setActualOperatorId(operatorId);
        record.setActualOperatorName(operatorName);
        record.setScanTime(LocalDateTime.now());
        record.setScanType(source.getScanType());
        record.setScanResult("success");
        record.setRemark(appendRemark(source.getRemark(), "拆菲转派生成"));
        record.setCuttingBundleId(target.getId());
        record.setCuttingBundleNo(target.getBundleNo());
        record.setCuttingBundleQrCode(target.getQrCode());
        record.setScanMode(source.getScanMode());
        record.setProcessUnitPrice(source.getProcessUnitPrice());
        record.setScanCost(source.getProcessUnitPrice() != null
                ? source.getProcessUnitPrice().multiply(BigDecimal.valueOf(quantity))
                : (source.getScanCost() != null && source.getQuantity() != null && source.getQuantity() > 0
                        ? source.getScanCost().multiply(BigDecimal.valueOf(quantity)).divide(BigDecimal.valueOf(source.getQuantity()), 2, java.math.RoundingMode.HALF_UP)
                        : source.getScanCost()));
        record.setDelegateTargetType(source.getDelegateTargetType());
        record.setDelegateTargetId(source.getDelegateTargetId());
        record.setDelegateTargetName(source.getDelegateTargetName());
        record.setTenantId(UserContext.tenantId());
        record.setFactoryId(source.getFactoryId());
        return record;
    }

    private void archiveSourceBundle(CuttingBundle source, String splitProcessName, Integer splitProcessOrder) {
        source.setSplitStatus("split_parent");
        // 不改 status — 父菲号在后续工序仍然活跃
        source.setSplitProcessName(splitProcessName);
        source.setSplitProcessOrder(splitProcessOrder);
        if (!StringUtils.hasText(source.getRootBundleId())) {
            source.setRootBundleId(source.getId());
        }
        if (!StringUtils.hasText(source.getBundleLabel()) && source.getBundleNo() != null) {
            source.setBundleLabel(String.valueOf(source.getBundleNo()));
        }
        cuttingBundleService.updateById(source);
    }

    private void registerPostCommitNotification(CuttingBundle source, CuttingBundleSplitTransferRequest request,
                                                 CuttingBundle completedBundle, CuttingBundle transferBundle) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            sendSplitNotifications(source, request, completedBundle, transferBundle);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                sendSplitNotifications(source, request, completedBundle, transferBundle);
            }
        });
    }

    private void sendSplitNotifications(CuttingBundle source, CuttingBundleSplitTransferRequest request,
                                         CuttingBundle completedBundle, CuttingBundle transferBundle) {
        try {
            String orderNo = source.getProductionOrderNo();
            String styleNo = source.getStyleNo();
            String color = source.getColor();
            String size = source.getSize();
            String bundleLabel = resolveBundleLabel(source);
            String fromOperatorId = source.getOperatorId();
            String fromOperatorName = source.getOperatorName();
            String toOperatorId = request.getToWorkerId();
            String toOperatorName = request.getToWorkerName();
            int transferQty = request.getTransferQuantity() != null ? request.getTransferQuantity() : 0;
            int remainQty = request.getCompletedQuantity() != null ? request.getCompletedQuantity() : 0;
            String processName = request.getCurrentProcessName();

            // 通知接手方：收到拆菲转派
            if (StringUtils.hasText(toOperatorId)) {
                webSocketService.notifyScanSuccess(toOperatorId, orderNo, styleNo,
                        processName, transferQty, toOperatorName, transferBundle.getBundleLabel());
                log.info("[拆菲通知] 已通知接手方: toWorkerId={}, toWorkerName={}, bundleLabel={}, qty={}",
                        toOperatorId, toOperatorName, transferBundle.getBundleLabel(), transferQty);
            }

            // 通知原持有者：菲号已拆分（带拆分详情）
            if (StringUtils.hasText(fromOperatorId)) {
                webSocketService.notifyDataChanged(fromOperatorId, "bundle_split",
                        String.valueOf(source.getId()), "split_transfer");
                log.info("[拆菲通知] 已通知原持有者: fromWorkerId={}, fromWorkerName={}, bundleLabel={}, 剩余={}, 转出={}",
                        fromOperatorId, fromOperatorName, bundleLabel, remainQty, transferQty);
            }
        } catch (Exception e) {
            log.warn("[拆菲通知] 推送失败（不阻断主流程）: bundleId={}, error={}",
                    source.getId(), e.getMessage(), e);
        }
    }

    private void restoreSourceBundle(CuttingBundle source, CuttingBundleSplitLog splitLog, int currentOrder, List<ProductionProcessTracking> sourceTrackings) {
        source.setSplitStatus("normal");
        source.setSplitProcessName(null);
        source.setSplitProcessOrder(null);
        source.setStatus(sourceTrackings.stream()
                .anyMatch(item -> (item.getProcessOrder() == null ? Integer.MAX_VALUE : item.getProcessOrder()) > currentOrder)
                ? "pending" : "completed");
        source.setParentBundleId(null);
        source.setSourceBundleId(null);
        source.setOperatorId(splitLog.getFromWorkerId());
        source.setOperatorName(splitLog.getFromWorkerName());
        cuttingBundleService.updateById(source);
    }

    private void restoreSourceTrackings(List<ProductionProcessTracking> sourceTrackings, int currentOrder) {
        for (ProductionProcessTracking item : sourceTrackings) {
            int order = item.getProcessOrder() == null ? Integer.MAX_VALUE : item.getProcessOrder();
            item.setScanStatus(order <= currentOrder ? "scanned" : "pending");
        }
        trackingService.updateBatchById(sourceTrackings);
    }

    private void restoreSourceScans(CuttingBundle source) {
        List<ScanRecord> archivedScans = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getCuttingBundleId, source.getId())
                .eq(ScanRecord::getScanResult, "split_archived")
                .list();
        for (ScanRecord item : archivedScans) {
            item.setScanResult("success");
            item.setRemark(appendRemark(item.getRemark(), "撤销拆菲已恢复原菲号"));
        }
        if (!archivedScans.isEmpty()) {
            scanRecordService.updateBatchById(archivedScans);
        }
    }

    private void validateRollbackChildren(CuttingBundle completedBundle, CuttingBundle transferBundle, int currentOrder) {
        validateChildStableForRollback(completedBundle, currentOrder, true);
        validateChildStableForRollback(transferBundle, currentOrder, false);
    }

    private void validateChildStableForRollback(CuttingBundle bundle, int currentOrder, boolean includeCurrent) {
        List<ProductionProcessTracking> trackings = trackingService.getByBundleId(bundle.getId());
        for (ProductionProcessTracking item : trackings) {
            int order = item.getProcessOrder() == null ? Integer.MAX_VALUE : item.getProcessOrder();
            String expectedStatus = order < currentOrder || (includeCurrent && order == currentOrder) ? "scanned" : "pending";
            if (!expectedStatus.equals(item.getScanStatus())) {
                throw new BusinessException("子菲号 " + resolveBundleLabel(bundle) + " 已继续流转，不能撤回拆菲");
            }
        }
        List<ScanRecord> scans = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getCuttingBundleId, bundle.getId())
                .list();
        for (ScanRecord item : scans) {
            if (StringUtils.hasText(item.getPayrollSettlementId()) || "settled".equalsIgnoreCase(item.getSettlementStatus())) {
                throw new BusinessException("子菲号 " + resolveBundleLabel(bundle) + " 已参与结算，不能撤回拆菲");
            }
            if ("success".equalsIgnoreCase(item.getScanResult())
                    && (item.getRemark() == null || !item.getRemark().contains("拆菲转派生成"))) {
                throw new BusinessException("子菲号 " + resolveBundleLabel(bundle) + " 已产生新的扫码记录，不能撤回拆菲");
            }
        }
    }

    private CuttingBundle resolveSource(CuttingBundleSplitTransferRequest request) {
        CuttingBundle bundle = resolveBundle(request.getBundleId(), request.getQrCode(), request.getOrderNo(), request.getBundleNo());
        if (bundle != null) {
            return bundle;
        }
        throw new BusinessException("未找到要拆分的菲号");
    }

    private CuttingBundle resolveBundle(String bundleId, String qrCode, String orderNo, Integer bundleNo) {
        if (StringUtils.hasText(bundleId)) {
            CuttingBundle bundle = cuttingBundleService.getById(bundleId.trim());
            if (bundle != null) return bundle;
        }
        if (StringUtils.hasText(qrCode)) {
            CuttingBundle bundle = cuttingBundleService.getByQrCode(qrCode.trim());
            if (bundle != null) return bundle;
        }
        if (StringUtils.hasText(orderNo) && bundleNo != null) {
            CuttingBundle bundle = cuttingBundleService.getByBundleNo(orderNo.trim(), bundleNo);
            if (bundle != null) return bundle;
        }
        return null;
    }

    private CuttingBundle resolveRollbackSource(CuttingBundle current) {
        if ("split_parent".equals(current.getSplitStatus())) {
            return current;
        }
        if ("split_child".equals(current.getSplitStatus()) && StringUtils.hasText(current.getSourceBundleId())) {
            CuttingBundle source = cuttingBundleService.getById(current.getSourceBundleId());
            if (source != null) {
                return source;
            }
        }
        throw new BusinessException("该菲号不是可撤回的拆菲记录");
    }

    private void validateRequest(CuttingBundle source, CuttingBundleSplitTransferRequest request) {
        if (!StringUtils.hasText(request.getCurrentProcessName())) throw new BusinessException("当前工序不能为空");
        if (request.getCompletedQuantity() == null || request.getCompletedQuantity() <= 0) throw new BusinessException("已完成数量必须大于0");
        if (request.getTransferQuantity() == null || request.getTransferQuantity() <= 0) throw new BusinessException("转派数量必须大于0");
        if (source.getQuantity() == null || source.getQuantity() <= 0) throw new BusinessException("原菲号数量无效");
        if (request.getCompletedQuantity() + request.getTransferQuantity() != source.getQuantity()) throw new BusinessException("已完成数量和转派数量之和必须等于原菲号数量");
        if ("split_parent".equals(source.getSplitStatus())) throw new BusinessException("该菲号已拆分为父菲号，不能再次执行");
        if (!StringUtils.hasText(request.getToWorkerName()) && !StringUtils.hasText(request.getToWorkerId())) throw new BusinessException("目标工人不能为空");
    }

    private CuttingBundleSplitLog buildSplitLog(CuttingBundle source, CuttingBundle completedBundle, CuttingBundle transferBundle, CuttingBundleSplitTransferRequest request) {
        CuttingBundleSplitLog logEntry = new CuttingBundleSplitLog();
        logEntry.setId(UUID.randomUUID().toString().replace("-", ""));
        logEntry.setTenantId(UserContext.tenantId());
        logEntry.setRootBundleId(StringUtils.hasText(source.getRootBundleId()) ? source.getRootBundleId() : source.getId());
        logEntry.setSourceBundleId(source.getId());
        logEntry.setSourceBundleNo(source.getBundleNo());
        logEntry.setSourceBundleLabel(resolveBundleLabel(source));
        logEntry.setSourceQuantity(source.getQuantity());
        logEntry.setCompletedQuantity(request.getCompletedQuantity());
        logEntry.setTransferQuantity(request.getTransferQuantity());
        logEntry.setCurrentProcessName(request.getCurrentProcessName());
        logEntry.setFromWorkerId(source.getOperatorId());
        logEntry.setFromWorkerName(source.getOperatorName());
        logEntry.setToWorkerId(request.getToWorkerId());
        logEntry.setToWorkerName(request.getToWorkerName());
        logEntry.setReason(request.getReason());
        logEntry.setCompletedBundleId(completedBundle.getId());
        logEntry.setCompletedBundleLabel(completedBundle.getBundleLabel());
        logEntry.setTransferBundleId(transferBundle.getId());
        logEntry.setTransferBundleLabel(transferBundle.getBundleLabel());
        logEntry.setCreator(UserContext.username());
        logEntry.setUpdater(UserContext.username());
        return logEntry;
    }

    private CuttingBundleSplitTransferResponse buildResponse(CuttingBundle source, String rootBundleId, CuttingBundleSplitTransferRequest request,
                                                             CuttingBundle completedBundle, CuttingBundle transferBundle) {
        CuttingBundleSplitTransferResponse response = new CuttingBundleSplitTransferResponse();
        response.setSuccess(true);
        response.setAction("split_transfer");
        response.setMessage("拆菲转派成功，后续可按子菲号继续扫码或打印");
        response.setRootBundleId(rootBundleId);
        response.setRootBundleLabel(resolveBundleLabel(source));
        response.setOrderNo(source.getProductionOrderNo());
        response.setSourceBundleId(source.getId());
        response.setSourceBundleLabel(resolveBundleLabel(source));
        response.setCurrentProcessName(request.getCurrentProcessName());
        response.setReason(request.getReason());
        response.setBundles(toBundleNodes(List.of(source, completedBundle, transferBundle)));
        return response;
    }

    private List<CuttingBundleSplitTransferResponse.BundleNode> toBundleNodes(List<CuttingBundle> bundles) {
        return bundles.stream().map(item -> {
            CuttingBundleSplitTransferResponse.BundleNode node = new CuttingBundleSplitTransferResponse.BundleNode();
            node.setBundleId(item.getId());
            node.setBundleLabel(resolveBundleLabel(item));
            node.setBundleNo(item.getBundleNo());
            node.setQuantity(item.getQuantity());
            node.setQrCode(item.getQrCode());
            node.setSplitStatus(item.getSplitStatus());
            node.setOperatorId(item.getOperatorId());
            node.setOperatorName(item.getOperatorName());
            return node;
        }).collect(Collectors.toList());
    }

    private String buildQrCode(CuttingBundle source, int quantity) {
        String base = String.format("%s-%s-%s-%s-%d-%d",
                trim(source.getProductionOrderNo()), trim(source.getStyleNo()), trim(source.getColor()), trim(source.getSize()),
                Math.max(quantity, 0), source.getBundleNo() == null ? 0 : source.getBundleNo());
        String sku = StringUtils.hasText(source.getProductionOrderNo()) && StringUtils.hasText(source.getStyleNo())
                && StringUtils.hasText(source.getColor()) && StringUtils.hasText(source.getSize())
                ? "SKU-" + trim(source.getProductionOrderNo()) + "-" + trim(source.getStyleNo()) + "-" + trim(source.getColor()) + "-" + trim(source.getSize())
                : null;
        return qrCodeSigner.sign(StringUtils.hasText(sku) ? base + "|" + sku : base);
    }

    private String resolveBundleLabel(CuttingBundle bundle) {
        return StringUtils.hasText(bundle.getBundleLabel()) ? bundle.getBundleLabel() : String.valueOf(bundle.getBundleNo());
    }

    private String appendRemark(String original, String extra) {
        return StringUtils.hasText(original) ? original + "；" + extra : extra;
    }

    private String trim(String value) {
        return StringUtils.hasText(value) ? value.trim() : "";
    }
}
