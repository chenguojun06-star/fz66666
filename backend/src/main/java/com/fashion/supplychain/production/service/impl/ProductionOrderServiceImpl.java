package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.orchestration.ProductionOrderFinanceOrchestrationService;
import com.fashion.supplychain.production.orchestration.ProductionOrderProgressOrchestrationService;
import com.fashion.supplychain.production.service.ProductionOrderProgressRecomputeService;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.time.LocalDateTime;

/**
 * 生产订单Service实现类
 */
@Service
@Slf4j
public class ProductionOrderServiceImpl extends ServiceImpl<ProductionOrderMapper, ProductionOrder>
        implements ProductionOrderService {

    @Autowired
    private ObjectProvider<StyleInfoService> styleInfoServiceProvider;

    @Autowired
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private ProductionOrderProgressRecomputeService progressRecomputeService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private ProductionOrderQueryService productionOrderQueryService;

    @Autowired
    private ObjectProvider<ProductionOrderProgressOrchestrationService> progressOrchestrationServiceProvider;

    @Autowired
    private ObjectProvider<ProductionOrderFinanceOrchestrationService> financeOrchestrationServiceProvider;

    @Override
    public IPage<ProductionOrder> queryPage(Map<String, Object> params) {
        return productionOrderQueryService.queryPage(params);
    }

    @Override
    public ProductionOrder getDetailById(String id) {
        return productionOrderQueryService.getDetailById(id);
    }

    @Override
    public boolean saveOrUpdateOrder(ProductionOrder productionOrder) {
        LocalDateTime now = LocalDateTime.now();

        boolean isCreate = !StringUtils.hasText(productionOrder.getId());

        if (!isCreate) {
            // 更新操作
            productionOrder.setUpdateTime(now);
        } else {
            String styleIdRaw = productionOrder == null ? null : productionOrder.getStyleId();
            String styleNoRaw = productionOrder == null ? null : productionOrder.getStyleNo();
            String styleId = StringUtils.hasText(styleIdRaw) ? styleIdRaw.trim() : null;
            String styleNo = StringUtils.hasText(styleNoRaw) ? styleNoRaw.trim() : null;

            StyleInfoService styleInfoService = styleInfoServiceProvider.getIfAvailable();
            if (styleInfoService == null) {
                throw new IllegalStateException("款号服务不可用");
            }
            com.fashion.supplychain.style.entity.StyleInfo style = styleInfoService.getValidatedForOrderCreate(styleId,
                    styleNo);
            productionOrder.setStyleId(String.valueOf(style.getId()));
            productionOrder.setStyleNo(style.getStyleNo());
            productionOrder.setStyleName(style.getStyleName());

            // 新增操作
            if (!StringUtils.hasText(productionOrder.getOrderNo())) {
                productionOrder.setOrderNo(nextOrderNo());
            }
            if (!StringUtils.hasText(productionOrder.getQrCode())) {
                productionOrder.setQrCode(productionOrder.getOrderNo());
            }
            productionOrder.setCreateTime(now);
            productionOrder.setUpdateTime(now);
            productionOrder.setDeleteFlag(0);
            productionOrder.setCompletedQuantity(0);
            productionOrder.setProductionProgress(0);
            productionOrder.setMaterialArrivalRate(0);
            productionOrder.setStatus("pending");
        }

        boolean ok = this.saveOrUpdate(productionOrder);
        if (ok && isCreate) {
            cuttingTaskService.createTaskIfAbsent(productionOrder);
            try {
                scanRecordDomainService.ensureBaseStageScanRecordsOnCreate(productionOrder);
                this.recomputeProgressFromRecords(productionOrder.getId().trim());
            } catch (Exception e) {
                log.warn("Failed to ensure stage scan records on order create: orderId={}",
                        productionOrder == null ? null : productionOrder.getId(),
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        productionOrder,
                        "ensureBaseStageScanRecordsOnCreate",
                        e == null ? "ensureBaseStageScanRecordsOnCreate failed"
                                : ("ensureBaseStageScanRecordsOnCreate failed: " + e.getMessage()),
                        LocalDateTime.now());
            }
        }
        return ok;
    }

    private String nextOrderNo() {
        LocalDateTime now = LocalDateTime.now();
        String ts = now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS"));
        for (int i = 0; i < 6; i++) {
            int rand = (int) (Math.random() * 900) + 100;
            String candidate = "ORD" + ts + rand;
            long cnt = this.count(new LambdaQueryWrapper<ProductionOrder>().eq(ProductionOrder::getOrderNo, candidate));
            if (cnt == 0) {
                return candidate;
            }
        }
        String nano = String.valueOf(System.nanoTime());
        String suffix = nano.length() > 6 ? nano.substring(nano.length() - 6) : nano;
        return "ORD" + ts + suffix;
    }

    @Override
    public boolean deleteById(String id) {
        // 逻辑删除
        ProductionOrder productionOrder = new ProductionOrder();
        productionOrder.setId(id);
        productionOrder.setDeleteFlag(1);
        productionOrder.setUpdateTime(LocalDateTime.now());

        return this.updateById(productionOrder);
    }

    @Override
    public boolean updateProductionProgress(String id, Integer progress) {
        try {
            return updateProductionProgress(id, progress, null, null);
        } catch (Exception e) {
            log.warn("Failed to update production progress: orderId={}, progress={}", id, progress, e);
            return false;
        }
    }

    @Transactional
    @Override
    public boolean updateProductionProgress(String id, Integer progress, String rollbackRemark,
            String rollbackToProcessName) {
        try {
            ProductionOrderProgressOrchestrationService svc = progressOrchestrationServiceProvider.getIfAvailable();
            if (svc == null) {
                throw new IllegalStateException("进度服务不可用");
            }
            return svc.updateProductionProgress(id, progress, rollbackRemark, rollbackToProcessName);
        } catch (Exception e) {
            log.warn("Failed to update production progress: orderId={}, progress={}, rollbackTo={}", id, progress,
                    rollbackToProcessName, e);
            return false;
        }
    }

    @Transactional
    @Override
    public boolean completeProduction(String id, BigDecimal tolerancePercent) {
        ProductionOrderFinanceOrchestrationService svc = financeOrchestrationServiceProvider.getIfAvailable();
        if (svc == null) {
            throw new IllegalStateException("财务结单服务不可用");
        }
        return svc.completeProduction(id, tolerancePercent);
    }

    @Transactional
    @Override
    public ProductionOrder closeOrder(String id) {
        ProductionOrderFinanceOrchestrationService svc = financeOrchestrationServiceProvider.getIfAvailable();
        if (svc == null) {
            throw new IllegalStateException("财务关单服务不可用");
        }
        return svc.closeOrder(id);
    }

    @Override
    public boolean updateMaterialArrivalRate(String id, Integer rate) {
        try {
            ProductionOrderProgressOrchestrationService svc = progressOrchestrationServiceProvider.getIfAvailable();
            if (svc == null) {
                throw new IllegalStateException("进度服务不可用");
            }
            return svc.updateMaterialArrivalRate(id, rate);
        } catch (Exception e) {
            log.warn("Failed to update material arrival rate: orderId={}, rate={}", id, rate, e);
            return false;
        }
    }

    @Override
    public ProductionOrder recomputeProgressFromRecords(String orderId) {
        return progressRecomputeService.recomputeProgressFromRecords(orderId);
    }
}
