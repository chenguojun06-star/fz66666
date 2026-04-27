package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ProcessSynonymMapping;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.SKUService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Component
@Slf4j
public class CuttingBundleCompletionHelper {

    private static final String CUTTING_PROCESS_NAME = "裁剪";

    @Autowired private CuttingBundleMapper cuttingBundleMapper;
    @Autowired private ScanRecordMapper scanRecordMapper;
    @Autowired private SKUService skuService;
    @Autowired private TemplateLibraryService templateLibraryService;
    @Autowired private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    public boolean markBundled(CuttingTask task) {
        if (task == null || !StringUtils.hasText(task.getProductionOrderId())) {
            return false;
        }

        String oid = task.getProductionOrderId().trim();
        LocalDateTime now = LocalDateTime.now();
        String requestId = "CUTTING_BUNDLED:" + oid;

        try {
            ScanRecord existing = scanRecordMapper.selectOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getRequestId, requestId)
                    .last("limit 1"));

            long cuttingQty = computeCuttingQuantityFromBundles(oid);
            if (cuttingQty <= 0) {
                int oq = task.getOrderQuantity() == null ? 0 : task.getOrderQuantity();
                if (oq > 0) cuttingQty = oq;
            }

            long already = computeAlreadyScannedQuantity(oid, requestId);
            long qtyToWrite = Math.max(0, cuttingQty - already);
            int finalQty = (int) Math.min((long) Integer.MAX_VALUE, qtyToWrite);
            if (finalQty <= 0 && existing == null) {
                return true;
            }

            BigDecimal cuttingUnitPrice = resolveCuttingUnitPrice(task.getStyleNo());
            String[] operatorInfo = resolveOperatorInfo(task);
            String operatorId = operatorInfo[0];
            String operatorName = operatorInfo[1];

            if (existing == null) {
                insertCuttingScanRecord(task, oid, finalQty, cuttingUnitPrice, operatorId, operatorName, now, requestId);
                updateProcessTracking(task, operatorId, operatorName, scanRecordMapper.selectOne(
                        new LambdaQueryWrapper<ScanRecord>().eq(ScanRecord::getRequestId, requestId).last("limit 1")).getId());
            } else {
                updateCuttingScanRecord(existing, task, oid, finalQty, cuttingUnitPrice, operatorId, operatorName, now);
                updateProcessTracking(task, operatorId, operatorName, existing.getId());
            }
        } catch (Exception e) {
            log.warn("Failed to upsert cutting bundled scan record: taskId={}, orderId={}",
                    task == null ? null : task.getId(),
                    task == null ? null : task.getProductionOrderId(), e);
        }
        return true;
    }

    private long computeCuttingQuantityFromBundles(String orderId) {
        long cuttingQty = 0;
        List<CuttingBundle> bundles = cuttingBundleMapper.selectList(new LambdaQueryWrapper<CuttingBundle>()
                .select(CuttingBundle::getQuantity)
                .eq(CuttingBundle::getProductionOrderId, orderId));
        if (bundles != null) {
            for (CuttingBundle b : bundles) {
                if (b == null) continue;
                int q = b.getQuantity() == null ? 0 : b.getQuantity();
                if (q > 0) cuttingQty += q;
            }
        }
        return cuttingQty;
    }

    private long computeAlreadyScannedQuantity(String orderId, String requestId) {
        long already = 0;
        List<ScanRecord> otherCutting = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                .select(ScanRecord::getRequestId, ScanRecord::getQuantity)
                .eq(ScanRecord::getOrderId, orderId)
                .in(ScanRecord::getScanType, Arrays.asList("production", "cutting"))
                .eq(ScanRecord::getScanResult, "success")
                .eq(ScanRecord::getProcessName, CUTTING_PROCESS_NAME));
        if (otherCutting != null) {
            for (ScanRecord r : otherCutting) {
                if (r == null) continue;
                String rid = r.getRequestId() == null ? null : r.getRequestId().trim();
                if (StringUtils.hasText(rid) && requestId.equals(rid)) continue;
                int q = r.getQuantity() == null ? 0 : r.getQuantity();
                if (q > 0) already += q;
            }
        }
        return already;
    }

    private String[] resolveOperatorInfo(CuttingTask task) {
        String operatorId = task.getReceiverId();
        String operatorName = task.getReceiverName();
        if (!StringUtils.hasText(operatorName)) {
            UserContext ctx = UserContext.get();
            if (ctx != null && StringUtils.hasText(ctx.getUsername())) {
                operatorId = ctx.getUserId();
                operatorName = ctx.getUsername();
                log.warn("裁剪任务缺少接收人信息，使用当前登录用户：taskId={}, user={}", task.getId(), operatorName);
            } else {
                throw new IllegalStateException("裁剪任务缺少接收人信息且无法获取当前登录用户，无法生成扫码记录：taskId=" + task.getId());
            }
        }
        return new String[]{operatorId, operatorName};
    }

    private void insertCuttingScanRecord(CuttingTask task, String oid, int finalQty,
                                          BigDecimal cuttingUnitPrice, String operatorId, String operatorName,
                                          LocalDateTime now, String requestId) {
        ScanRecord sr = new ScanRecord();
        sr.setRequestId(requestId);
        sr.setOrderId(oid);
        sr.setOrderNo(task.getProductionOrderNo());
        sr.setStyleId(task.getStyleId());
        sr.setStyleNo(task.getStyleNo());
        sr.setTenantId(task.getTenantId());
        sr.setColor(task.getColor());
        sr.setSize(task.getSize());
        sr.setQuantity(finalQty);
        sr.setProgressStage(CUTTING_PROCESS_NAME);
        sr.setProcessName(CUTTING_PROCESS_NAME);
        sr.setOperatorId(operatorId);
        sr.setOperatorName(operatorName);
        sr.setScanType("cutting");
        sr.setScanResult("success");
        sr.setRemark("裁剪完成");
        sr.setScanTime(now);
        sr.setCreateTime(now);
        sr.setUpdateTime(now);
        sr.setUnitPrice(cuttingUnitPrice);
        sr.setProcessUnitPrice(cuttingUnitPrice);
        sr.setScanCost(cuttingUnitPrice);
        sr.setTotalAmount(computeCuttingTotalAmount(cuttingUnitPrice, finalQty));
        if (skuService != null) skuService.attachProcessUnitPrice(sr);
        scanRecordMapper.insert(sr);
    }

    private void updateCuttingScanRecord(ScanRecord existing, CuttingTask task, String oid, int finalQty,
                                          BigDecimal cuttingUnitPrice, String operatorId, String operatorName,
                                          LocalDateTime now) {
        ScanRecord patch = new ScanRecord();
        patch.setId(existing.getId());
        patch.setQuantity(finalQty);
        patch.setProgressStage(CUTTING_PROCESS_NAME);
        patch.setOperatorId(operatorId);
        patch.setOperatorName(operatorName);
        patch.setScanType("cutting");
        patch.setScanTime(now);
        patch.setUpdateTime(now);
        if (existing.getUnitPrice() == null || existing.getUnitPrice().compareTo(BigDecimal.ZERO) <= 0) {
            patch.setUnitPrice(cuttingUnitPrice);
            patch.setProcessUnitPrice(cuttingUnitPrice);
            patch.setScanCost(cuttingUnitPrice);
        }
        patch.setTotalAmount(computeCuttingTotalAmount(
                cuttingUnitPrice != null ? cuttingUnitPrice : BigDecimal.ZERO, finalQty));
        scanRecordMapper.updateById(patch);
    }

    private void updateProcessTracking(CuttingTask task, String operatorId, String operatorName, String scanRecordId) {
        try {
            if (processTrackingOrchestrator == null) {
                log.warn("processTrackingOrchestrator未注入，跳过工序跟踪更新：taskId={}", task.getId());
                return;
            }
            List<CuttingBundle> bundles = cuttingBundleMapper.selectList(
                new LambdaQueryWrapper<CuttingBundle>()
                    .eq(CuttingBundle::getProductionOrderId, task.getProductionOrderId())
                    .eq(CuttingBundle::getColor, task.getColor())
                    .eq(CuttingBundle::getSize, task.getSize()));
            if (bundles == null || bundles.isEmpty()) {
                log.warn("未找到裁剪菲号，无法更新工序跟踪：taskId={}, orderId={}, color={}, size={}",
                    task.getId(), task.getProductionOrderId(), task.getColor(), task.getSize());
                return;
            }
            for (CuttingBundle bundle : bundles) {
                try {
                    boolean updated = processTrackingOrchestrator.forcedUpdateCuttingScan(
                        bundle.getId(), operatorId, operatorName, scanRecordId);
                    if (!updated) {
                        log.warn("裁剪工序跟踪更新失败：bundleId={}, operator={}", bundle.getId(), operatorName);
                    }
                } catch (Exception e) {
                    log.warn("更新工序跟踪失败：bundleId={}, processName={}", bundle.getId(), CUTTING_PROCESS_NAME, e);
                }
            }
            log.info("裁剪完成工序跟踪更新成功：taskId={}, bundleCount={}, operator={}",
                task.getId(), bundles.size(), operatorName);
        } catch (Exception e) {
            log.error("更新工序跟踪失败：taskId={}", task.getId(), e);
        }
    }

    private BigDecimal resolveCuttingUnitPrice(String styleNo) {
        if (!StringUtils.hasText(styleNo)) return BigDecimal.ZERO;
        try {
            Map<String, BigDecimal> prices = templateLibraryService.resolveProcessUnitPrices(styleNo.trim());
            if (prices == null || prices.isEmpty()) return BigDecimal.ZERO;
            BigDecimal price = prices.get(CUTTING_PROCESS_NAME);
            if (price != null && price.compareTo(BigDecimal.ZERO) > 0) return price;
            for (Map.Entry<String, BigDecimal> entry : prices.entrySet()) {
                String key = entry.getKey();
                if (key != null && ProcessSynonymMapping.isEquivalent("裁剪", key)) {
                    BigDecimal v = entry.getValue();
                    if (v != null && v.compareTo(BigDecimal.ZERO) > 0) return v;
                }
            }
        } catch (Exception e) {
            log.warn("解析裁剪单价失败: styleNo={}", styleNo, e);
        }
        return BigDecimal.ZERO;
    }

    private BigDecimal computeCuttingTotalAmount(BigDecimal unitPrice, int quantity) {
        BigDecimal up = unitPrice == null ? BigDecimal.ZERO : unitPrice;
        int q = Math.max(0, quantity);
        return up.multiply(BigDecimal.valueOf(q)).setScale(2, RoundingMode.HALF_UP);
    }
}
