package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
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
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.style.entity.StyleInfo;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
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

    // TODO [架构债务] 以下ObjectProvider跨模块依赖应迁移到ProductionOrderOrchestrator：
    // generateMaterialPurchases()使用StyleBomService+MaterialPurchaseService+StyleInfoService
    // 订单创建流程(saveOrUpdateOrder)中的款式验证、裁剪任务创建、采购生成均属编排逻辑
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
    private ObjectProvider<MaterialPurchaseService> materialPurchaseServiceProvider;

    @Autowired
    private ObjectProvider<StyleBomService> styleBomServiceProvider;

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
    @Transactional(rollbackFor = Exception.class)
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

            // ✅ 记录创建人信息 - 操作人追踪必要设定
            String currentUserId = UserContext.userId();
            String currentUserName = UserContext.username();
            if (StringUtils.hasText(currentUserId)) {
                productionOrder.setCreatedById(currentUserId);
                productionOrder.setCreatedByName(currentUserName);
            }
        }

        boolean ok = this.saveOrUpdate(productionOrder);
        if (ok && isCreate) {
            cuttingTaskService.createTaskIfAbsent(productionOrder);
            this.generateMaterialPurchases(productionOrder);
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
            int rand = (int) (ThreadLocalRandom.current().nextDouble() * 900) + 100;
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
            throw new IllegalStateException("财务完成服务不可用");
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

    @Override
    public void recomputeProgressAsync(String orderId) {
        progressRecomputeService.recomputeProgressAsync(orderId);
    }

    @Override
    public ProductionOrder getByOrderNo(String orderNo) {
        if (!StringUtils.hasText(orderNo)) {
            return null;
        }
        return this.getOne(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getOrderNo, orderNo.trim())
                .last("LIMIT 1"));
    }

    private void generateMaterialPurchases(ProductionOrder order) {
        if (order == null || !StringUtils.hasText(order.getId())) {
            return;
        }

        StyleBomService styleBomService = styleBomServiceProvider.getIfAvailable();
        MaterialPurchaseService materialPurchaseService = materialPurchaseServiceProvider.getIfAvailable();
        StyleInfoService styleInfoService = styleInfoServiceProvider.getIfAvailable();

        if (styleBomService == null || materialPurchaseService == null || styleInfoService == null) {
            log.warn("Required services not available for generating material purchases");
            return;
        }

        Long styleId = null;
        try {
            styleId = Long.parseLong(order.getStyleId());
        } catch (NumberFormatException e) {
            log.error("Invalid styleId: {}", order.getStyleId());
            return;
        }

        List<StyleBom> bomList = styleBomService.listByStyleId(styleId);
        if (bomList == null || bomList.isEmpty()) {
            return;
        }

        StyleInfo style = styleInfoService.getById(styleId);
        String cover = style != null ? style.getCover() : null;

        List<MaterialPurchase> purchases = new ArrayList<>();
        int orderQty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;

        for (StyleBom bom : bomList) {
            MaterialPurchase mp = new MaterialPurchase();
            mp.setOrderId(order.getId());
            mp.setOrderNo(order.getOrderNo());
            mp.setStyleId(order.getStyleId());
            mp.setStyleNo(order.getStyleNo());
            mp.setStyleName(order.getStyleName());
            mp.setStyleCover(cover);

            mp.setMaterialCode(bom.getMaterialCode());
            mp.setMaterialName(bom.getMaterialName());
            mp.setMaterialType(bom.getMaterialType());
            mp.setSpecifications(bom.getSpecification());
            mp.setUnit(bom.getUnit());
            mp.setSupplierName(bom.getSupplier());

            BigDecimal usage = bom.getUsageAmount() != null ? bom.getUsageAmount() : BigDecimal.ZERO;
            BigDecimal loss = bom.getLossRate() != null ? bom.getLossRate() : BigDecimal.ZERO;

            BigDecimal totalUsage = usage.multiply(BigDecimal.valueOf(orderQty));
            BigDecimal withLoss = totalUsage
                    .multiply(BigDecimal.ONE.add(loss.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP)));
            mp.setPurchaseQuantity(withLoss.setScale(0, RoundingMode.CEILING).intValue());

            mp.setUnitPrice(bom.getUnitPrice());
            if (mp.getPurchaseQuantity() != null && mp.getUnitPrice() != null) {
                mp.setTotalAmount(mp.getUnitPrice().multiply(BigDecimal.valueOf(mp.getPurchaseQuantity())));
            }

            // if (order.getPlannedEndDate() != null) {
            // mp.setExpectedShipDate(order.getPlannedEndDate().toLocalDate());
            // }

            // Generate purchaseNo
            String ts = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS"));
            int rand = (int) (ThreadLocalRandom.current().nextDouble() * 900) + 100;
            mp.setPurchaseNo("PUR" + ts + rand);

            mp.setStatus("pending");
            mp.setCreateTime(LocalDateTime.now());
            mp.setUpdateTime(LocalDateTime.now());
            mp.setDeleteFlag(0);
            mp.setArrivedQuantity(0);

            purchases.add(mp);
        }

        if (!purchases.isEmpty()) {
            materialPurchaseService.saveBatch(purchases);
        }
    }
}
