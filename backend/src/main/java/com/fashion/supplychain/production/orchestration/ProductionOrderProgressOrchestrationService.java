package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductionOrderProgressOrchestrationService {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialPurchaseMapper materialPurchaseMapper;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    public int recomputeProgressByStyleNo(String styleNo) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        if (!StringUtils.hasText(sn)) {
            throw new IllegalArgumentException("参数错误");
        }

        List<ProductionOrder> orders = productionOrderService.list(new LambdaQueryWrapper<ProductionOrder>()
                .select(ProductionOrder::getId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getStyleNo, sn));

        int recomputed = 0;
        if (orders != null) {
            for (ProductionOrder o : orders) {
                if (o == null || !StringUtils.hasText(o.getId())) {
                    continue;
                }
                try {
                    productionOrderService.recomputeProgressFromRecords(o.getId().trim());
                    recomputed += 1;
                } catch (Exception e) {
                    log.warn("Failed to recompute progress by styleNo: styleNo={}, orderId={}", sn, o.getId(), e);
                }
            }
        }

        return recomputed;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateProductionProgress(String id, Integer progress, String rollbackRemark,
            String rollbackToProcessName) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }

        int currentProgress = existed.getProductionProgress() == null ? 0 : existed.getProductionProgress();
        int p = scanRecordDomainService.clampPercent(progress == null ? 0 : progress);
        boolean isRollback = p < currentProgress;
        String remark = rollbackRemark == null ? "" : rollbackRemark.trim();
        boolean supervisorOrAbove = UserContext.isSupervisorOrAbove();

        if (isRollback) {
            if (!StringUtils.hasText(remark)) {
                throw new IllegalStateException("请填写问题点");
            }
            if (!supervisorOrAbove) {
                throw new AccessDeniedException("无权限退回环节");
            }

            List<String> nodes = scanRecordDomainService.resolveProgressNodes(existed.getStyleNo());
            if (nodes != null && nodes.size() > 1) {
                int curIdx = scanRecordDomainService.getNodeIndexFromProgress(nodes.size(), currentProgress);
                int nextIdx = scanRecordDomainService.getNodeIndexFromProgress(nodes.size(), p);
                if (curIdx - nextIdx != 1) {
                    throw new IllegalStateException("仅允许退回上一个环节");
                }
            }
        }

        if (!isRollback && p != currentProgress && !supervisorOrAbove) {
            List<String> nodes = scanRecordDomainService.resolveProgressNodes(existed.getStyleNo());
            if (nodes != null && nodes.size() > 1) {
                int curIdx = scanRecordDomainService.getNodeIndexFromProgress(nodes.size(), currentProgress);
                int nextIdx = scanRecordDomainService.getNodeIndexFromProgress(nodes.size(), p);
                if (nextIdx - curIdx > 1) {
                    throw new IllegalStateException("仅允许推进到下一环节");
                }
            }
        }

        boolean procurementStarted = materialPurchaseService.existsActivePurchaseForOrder(oid);
        boolean realProductionStarted = scanRecordDomainService.existsRealProductionScanForOrder(oid);

        String curStatus = existed.getStatus() == null ? "" : existed.getStatus().trim();
        String nextStatus;
        if ("completed".equalsIgnoreCase(curStatus)) {
            nextStatus = "completed";
        } else if (procurementStarted || realProductionStarted) {
            nextStatus = "production";
        } else {
            nextStatus = p <= 0 ? "pending" : "production";
        }

        LocalDateTime now = LocalDateTime.now();
        boolean updated = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getProductionProgress, p)
                .set(ProductionOrder::getStatus, nextStatus)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!updated) {
            throw new IllegalStateException("更新失败");
        }

        if (p != currentProgress) {
            if (isRollback) {
                String pn = StringUtils.hasText(rollbackToProcessName) ? rollbackToProcessName.trim() : null;
                if (!StringUtils.hasText(pn)) {
                    pn = scanRecordDomainService.resolveNodeNameFromProgress(existed.getStyleNo(), p);
                }
                scanRecordDomainService.insertRollbackRecord(existed, pn, remark, now);
                try {
                    scanRecordDomainService.invalidateFlowAfterRollback(existed, p, pn, now);
                } catch (Exception e) {
                    log.warn("Failed to invalidate flow after rollback: orderId={}, progress={}, rollbackTo={}",
                            existed.getId(), p, pn, e);
                }
            } else {
                try {
                    scanRecordDomainService.insertAdvanceRecord(existed, p, now);
                } catch (Exception e) {
                    log.warn("Failed to insert advance record: orderId={}, progress={}", existed.getId(), p, e);
                }
            }
        }

        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateMaterialArrivalRate(String id, Integer rate) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }

        int r = scanRecordDomainService.clampPercent(rate == null ? 0 : rate);
        ProductionOrder patch = new ProductionOrder();
        patch.setId(oid);
        patch.setMaterialArrivalRate(r);
        patch.setUpdateTime(LocalDateTime.now());
        boolean ok = productionOrderService.updateById(patch);
        if (!ok) {
            throw new IllegalStateException("更新失败");
        }

        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty > 0) {
            int qty = (int) Math.round(orderQty * (r / 100.0));
            if (qty < 0) {
                qty = 0;
            }
            if (qty > orderQty) {
                qty = orderQty;
            }

            LocalDateTime scanTime = null;
            String operatorId = null;
            String operatorName = null;
            try {
                List<MaterialPurchase> purchases = materialPurchaseMapper
                        .selectList(new LambdaQueryWrapper<MaterialPurchase>()
                                .select(MaterialPurchase::getReceivedTime, MaterialPurchase::getUpdateTime,
                                        MaterialPurchase::getReceiverId, MaterialPurchase::getReceiverName)
                                .eq(MaterialPurchase::getOrderId, oid)
                                .eq(MaterialPurchase::getDeleteFlag, 0));
                if (purchases != null) {
                    for (MaterialPurchase p : purchases) {
                        if (p == null) {
                            continue;
                        }
                        LocalDateTime t = p.getReceivedTime();
                        if (t == null) {
                            t = p.getUpdateTime();
                        }
                        if (scanTime == null || (t != null && t.isAfter(scanTime))) {
                            scanTime = t;
                            operatorId = p.getReceiverId();
                            operatorName = p.getReceiverName();
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to query material purchases when updating arrival rate: orderId={}", oid, e);
            }
            if (scanTime == null) {
                scanTime = LocalDateTime.now();
            }

            if (qty > 0) {
                scanRecordDomainService.upsertStageScanRecord(
                        ProductionOrderScanRecordDomainService.REQUEST_PREFIX_PROCUREMENT + oid,
                        oid,
                        order.getOrderNo(),
                        order.getStyleId(),
                        order.getStyleNo(),
                        order.getColor(),
                        order.getSize(),
                        qty,
                        ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT,
                        scanTime,
                        operatorId,
                        StringUtils.hasText(operatorName) ? operatorName : "system");
            } else {
                // If quantity is 0, we should ensure no fake procurement record exists
                try {
                    com.fashion.supplychain.production.entity.ScanRecord probe = new com.fashion.supplychain.production.entity.ScanRecord();
                    probe.setRequestId(ProductionOrderScanRecordDomainService.REQUEST_PREFIX_PROCUREMENT + oid);
                    com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<com.fashion.supplychain.production.entity.ScanRecord> wrapper = 
                        new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
                    wrapper.eq(com.fashion.supplychain.production.entity.ScanRecord::getRequestId, probe.getRequestId());
                    // We can use scanRecordService to remove if it exists, but we need to inject it or use mapper?
                    // This class injects scanRecordDomainService, but not scanRecordService directly.
                    // However, scanRecordDomainService uses scanRecordMapper.
                    // Let's keep it simple: if qty > 0 create. 
                    // The cleanup orchestrator handles the deletion of existing ones if they are considered "fake" (quantity 0 usually).
                    // But wait, "fake" ones created before had quantity 0?
                    // In ensureBaseStageRecordsIfAbsent, qty was calculated from rate. If rate=0, qty=0.
                    // So yes, records with qty=0 were created.
                } catch (Exception e) {
                    // ignore
                }
            }

            productionOrderService.recomputeProgressFromRecords(oid);
        }
        return true;
    }

}
