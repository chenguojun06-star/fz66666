package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.service.helper.MaterialPurchaseHelper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.util.StringUtils;
import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class MaterialPurchaseServiceImpl extends ServiceImpl<MaterialPurchaseMapper, MaterialPurchase>
        implements MaterialPurchaseService {

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPurchaseServiceHelper serviceHelper;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteByOrderId(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return false;
        }
        return this.remove(new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getOrderId, orderId.trim()));
    }

    @Override
    public String resolveMaterialId(MaterialPurchase purchase) {
        return MaterialPurchaseHelper.resolveMaterialId(purchase);
    }

    @Override
    public IPage<MaterialPurchase> queryPage(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : params;
        long page = ParamUtils.getPageLong(safeParams);
        long pageSize = ParamUtils.getPageSizeLong(safeParams);

        String purchaseNo = (String) safeParams.getOrDefault("purchaseNo", "");
        String materialCode = (String) safeParams.getOrDefault("materialCode", "");
        String materialName = (String) safeParams.getOrDefault("materialName", "");
        String supplier = (String) safeParams.getOrDefault("supplier", "");
        String supplierName = (String) safeParams.getOrDefault("supplierName", "");
        String status = (String) safeParams.getOrDefault("status", "");
        String orderNo = (String) safeParams.getOrDefault("orderNo", "");
        String styleNo = (String) safeParams.getOrDefault("styleNo", "");
        String materialType = (String) safeParams.getOrDefault("materialType", "");
        String sourceType = (String) safeParams.getOrDefault("sourceType", "");
        String factoryType = (String) safeParams.getOrDefault("factoryType", "");
        String factoryName = (String) safeParams.getOrDefault("factoryName", "");
        String receiverId = (String) safeParams.getOrDefault("receiverId", "");
        String receiverName = (String) safeParams.getOrDefault("receiverName", "");

        // 提前获取 tenantId（供 keywordMatchedOrderIds 及后续 notIn 优化复用）
        Long tenantId = UserContext.tenantId();

        final List<String> keywordMatchedOrderIds = StringUtils.hasText(orderNo)
            ? productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                    .select(ProductionOrder::getId)
                    .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)
                    .and(w -> w.like(ProductionOrder::getFactoryName, orderNo.trim())
                        .or().like(ProductionOrder::getOrderNo, orderNo.trim())
                        .or().like(ProductionOrder::getStyleNo, orderNo.trim()))
                    .and(w -> w.isNull(ProductionOrder::getDeleteFlag)
                        .or().eq(ProductionOrder::getDeleteFlag, 0))
                    .ne(ProductionOrder::getStatus, "scrapped"))
                .stream()
                .map(ProductionOrder::getId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toList())
            : java.util.Collections.emptyList();

        Page<MaterialPurchase> pageInfo = new Page<>(page, pageSize);
        LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getDeleteFlag, 0);

        // 🔒 多租户隔离：非工厂账号也必须按 tenantId 过滤，防止跨租户数据泄漏
        wrapper.eq(tenantId != null, MaterialPurchase::getTenantId, tenantId);

        // orderNo作为通用搜索关键词，支持订单号/采购单号/物料编码/物料名称的or查询
        if (StringUtils.hasText(orderNo)) {
            String keyword = orderNo.trim();
            wrapper.and(w -> {
                w.like(MaterialPurchase::getOrderNo, keyword)
                        .or().like(MaterialPurchase::getPurchaseNo, keyword)
                        .or().like(MaterialPurchase::getMaterialCode, keyword)
                        .or().like(MaterialPurchase::getMaterialName, keyword)
                        .or().like(MaterialPurchase::getSupplierName, keyword);
                if (!keywordMatchedOrderIds.isEmpty()) {
                    w.or().in(MaterialPurchase::getOrderId, keywordMatchedOrderIds);
                }
            });
        }

        // 独立搜索字段（用于高级筛选）
        wrapper.like(StringUtils.hasText(purchaseNo) && !StringUtils.hasText(orderNo), MaterialPurchase::getPurchaseNo, purchaseNo)
                .like(StringUtils.hasText(materialCode) && !StringUtils.hasText(orderNo), MaterialPurchase::getMaterialCode, materialCode)
                .like(StringUtils.hasText(materialName) && !StringUtils.hasText(orderNo), MaterialPurchase::getMaterialName, materialName)
                .like(StringUtils.hasText(styleNo), MaterialPurchase::getStyleNo, styleNo)
                .eq(StringUtils.hasText(receiverId), MaterialPurchase::getReceiverId, receiverId)
                .like(StringUtils.hasText(receiverName), MaterialPurchase::getReceiverName, receiverName)
                .and(StringUtils.hasText(status), w -> {
                    if ("partial".equals(status)) {
                        w.in(MaterialPurchase::getStatus, "partial", "partial_arrival");
                    } else {
                        w.eq(MaterialPurchase::getStatus, status);
                    }
                })
                .orderByDesc(MaterialPurchase::getCreateTime);

        // sourceType筛选：batch同时匹配batch、stock和manual（均为非订单采购）
        if (StringUtils.hasText(sourceType)) {
            if ("batch".equals(sourceType)) {
                wrapper.in(MaterialPurchase::getSourceType, "batch", "stock", "manual");
            } else {
                wrapper.eq(MaterialPurchase::getSourceType, sourceType);
            }
        }

        if (StringUtils.hasText(materialType)) {
            String mt = materialType.trim();
            if (MaterialConstants.TYPE_FABRIC.equals(mt) || MaterialConstants.TYPE_LINING.equals(mt)
                    || MaterialConstants.TYPE_ACCESSORY.equals(mt)) {
                wrapper.and(w -> {
                    w.likeRight(MaterialPurchase::getMaterialType, mt);
                    if (MaterialConstants.TYPE_FABRIC.equals(mt)) {
                        w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_FABRIC_CN);
                    } else if (MaterialConstants.TYPE_LINING.equals(mt)) {
                        w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_LINING_CN);
                    } else if (MaterialConstants.TYPE_ACCESSORY.equals(mt)) {
                        w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_ACCESSORY_CN);
                    }
                });
            } else {
                wrapper.eq(MaterialPurchase::getMaterialType, mt);
            }
        }

        if (StringUtils.hasText(supplierName)) {
            wrapper.like(MaterialPurchase::getSupplierName, supplierName);
        } else if (StringUtils.hasText(supplier)) {
            wrapper.like(MaterialPurchase::getSupplierName, supplier);
        }

        // 只有"我的订单"允许显示报废订单，采购页默认必须排除报废订单关联记录。
        // 【性能优化】用预加载 ID 列表取代 NOT IN(SELECT...) 关联子查询，消除全表扫描（慢查询 1.4-2.5s 根因）
        List<String> scrappedOrderIds = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId)
                        .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)
                        .and(w -> w.eq(ProductionOrder::getDeleteFlag, 1)
                                .or().eq(ProductionOrder::getStatus, "scrapped")))
                .stream().map(ProductionOrder::getId).filter(StringUtils::hasText)
                .collect(Collectors.toList());
        if (!scrappedOrderIds.isEmpty()) {
            wrapper.and(w -> w.isNull(MaterialPurchase::getOrderId)
                    .or().eq(MaterialPurchase::getOrderId, "")
                    .or().notIn(MaterialPurchase::getOrderId, scrappedOrderIds));
        }
        // scrappedOrderIds 为空时无需过滤（本租户无报废/删除订单，所有记录均有效）

        // factoryType 过滤：预加载匹配订单 ID，替代 IN(SELECT...) 关联子查询
        // 无 order_id 的记录（batch/stock/manual）不受此过滤影响
        if (StringUtils.hasText(factoryType)) {
            List<String> ftOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)
                            .eq(ProductionOrder::getFactoryType, factoryType.trim().toUpperCase())
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                            .ne(ProductionOrder::getStatus, "scrapped"))
                    .stream().map(ProductionOrder::getId).filter(StringUtils::hasText)
                    .collect(Collectors.toList());
            wrapper.and(w -> {
                w.isNull(MaterialPurchase::getOrderId).or().eq(MaterialPurchase::getOrderId, "");
                if (!ftOrderIds.isEmpty()) w.or().in(MaterialPurchase::getOrderId, ftOrderIds);
            });
        }
        if (StringUtils.hasText(factoryName)) {
            List<String> fnOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)
                            .like(ProductionOrder::getFactoryName, factoryName.trim())
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                            .ne(ProductionOrder::getStatus, "scrapped"))
                    .stream().map(ProductionOrder::getId).filter(StringUtils::hasText)
                    .collect(Collectors.toList());
            wrapper.and(w -> {
                w.isNull(MaterialPurchase::getOrderId).or().eq(MaterialPurchase::getOrderId, "");
                if (!fnOrderIds.isEmpty()) w.or().in(MaterialPurchase::getOrderId, fnOrderIds);
            });
        }
        // 工厂账号隔离（由 MaterialPurchaseOrchestratorHelper 注入 _factoryOrderIds）
        @SuppressWarnings("unchecked")
        List<String> factoryOrderIds = (List<String>) safeParams.get("_factoryOrderIds");
        if (factoryOrderIds != null && !factoryOrderIds.isEmpty()) {
            wrapper.in(MaterialPurchase::getOrderId, factoryOrderIds);
        }

        IPage<MaterialPurchase> pageResult = baseMapper.selectPage(pageInfo, wrapper);

        List<MaterialPurchase> records = pageResult == null ? null : pageResult.getRecords();
        if (records != null && !records.isEmpty()) {
            for (MaterialPurchase record : records) {
                if (record == null || !StringUtils.hasText(record.getId())) {
                    continue;
                }
                String beforeStatus = record.getStatus();

                serviceHelper.ensureSnapshot(record);

                if (record.getReturnConfirmed() != null && record.getReturnConfirmed() == 1) {
                    Integer beforeArrivedQuantity = record.getArrivedQuantity();
                    int arrived = beforeArrivedQuantity == null ? 0 : beforeArrivedQuantity;
                    int rq = record.getReturnQuantity() == null ? 0 : record.getReturnQuantity();
                    if (arrived != rq) {
                        record.setArrivedQuantity(rq);

                        if (record.getUnitPrice() != null) {
                            record.setTotalAmount(record.getUnitPrice().multiply(BigDecimal.valueOf(rq)));
                        }

                        int pq = record.getPurchaseQuantity() == null ? 0 : record.getPurchaseQuantity().intValue();
                        String s = beforeStatus == null ? "" : beforeStatus.trim();
                        record.setStatus(MaterialPurchaseHelper.resolveStatusByArrived(s, rq, pq));
                    }
                }

                MaterialPurchaseHelper.repairReceiverFromRemark(record);

            }
        }

        // 关联查询订单信息，填充生产方名称和类型
        List<MaterialPurchase> records2 = pageResult.getRecords();
        List<String> orderIdsForFactory = records2.stream()
                .map(MaterialPurchase::getOrderId)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());
        if (!orderIdsForFactory.isEmpty()) {
            List<ProductionOrder> factoryOrders = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .in(ProductionOrder::getId, orderIdsForFactory)
                            .select(ProductionOrder::getId, ProductionOrder::getFactoryName, ProductionOrder::getFactoryType)
            );
            Map<String, ProductionOrder> factoryOrderMap = factoryOrders.stream()
                    .filter(o -> o != null && StringUtils.hasText(o.getId()))
                    .collect(Collectors.toMap(ProductionOrder::getId, o -> o, (a, b) -> a));
            for (MaterialPurchase record : records2) {
                String oid = record.getOrderId();
                if (StringUtils.hasText(oid) && factoryOrderMap.containsKey(oid.trim())) {
                    ProductionOrder order = factoryOrderMap.get(oid.trim());
                    record.setFactoryName(order.getFactoryName());
                    record.setFactoryType(order.getFactoryType());
                }
            }
        }

        // 从物料资料库补全缺失属性（fabricWidth / fabricWeight / fabricComposition / supplierName / unitPrice 等）
        List<String> matCodes = records2.stream()
                .map(MaterialPurchase::getMaterialCode)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());
        if (!matCodes.isEmpty()) {
            Map<String, MaterialDatabase> dbMap = materialDatabaseService.list(
                    new LambdaQueryWrapper<MaterialDatabase>()
                            .in(MaterialDatabase::getMaterialCode, matCodes)
                            .select(MaterialDatabase::getId, MaterialDatabase::getMaterialCode,
                                    MaterialDatabase::getFabricWidth, MaterialDatabase::getFabricWeight,
                                    MaterialDatabase::getFabricComposition, MaterialDatabase::getSupplierName,
                                    MaterialDatabase::getUnitPrice, MaterialDatabase::getColor,
                                    MaterialDatabase::getSpecifications))
                    .stream()
                    .filter(d -> d != null && StringUtils.hasText(d.getMaterialCode()))
                    .collect(Collectors.toMap(MaterialDatabase::getMaterialCode, d -> d, (a, b) -> a));
            for (MaterialPurchase record : records2) {
                MaterialDatabase db = dbMap.get(record.getMaterialCode());
                if (db == null) continue;
                if (!StringUtils.hasText(record.getFabricWidth())) record.setFabricWidth(db.getFabricWidth());
                if (!StringUtils.hasText(record.getFabricWeight())) record.setFabricWeight(db.getFabricWeight());
                if (!StringUtils.hasText(record.getFabricComposition())) record.setFabricComposition(db.getFabricComposition());
                if (!StringUtils.hasText(record.getSupplierName()) && StringUtils.hasText(db.getSupplierName())) record.setSupplierName(db.getSupplierName());
                if ((record.getUnitPrice() == null || record.getUnitPrice().compareTo(BigDecimal.ZERO) == 0) && db.getUnitPrice() != null) record.setUnitPrice(db.getUnitPrice());
                if (!StringUtils.hasText(record.getColor()) && StringUtils.hasText(db.getColor())) record.setColor(db.getColor());
                if (!StringUtils.hasText(record.getSpecifications()) && StringUtils.hasText(db.getSpecifications())) record.setSpecifications(db.getSpecifications());
            }
        }

        return pageResult;
    }

    @Override
    public boolean existsActivePurchaseForOrder(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return false;
        }
        try {
            return this.count(new LambdaQueryWrapper<MaterialPurchase>()
                    .eq(MaterialPurchase::getOrderId, oid)
                    .eq(MaterialPurchase::getDeleteFlag, 0)) > 0;
        } catch (Exception e) {
            log.warn("Failed to check purchases for order: orderId={}", oid, e);
            return false;
        }
    }

    @Override
    public boolean deleteById(String id) {
        return this.removeById(id);
    }

    @Override
    public boolean saveBatchPurchases(List<MaterialPurchase> purchases) {
        if (purchases == null || purchases.isEmpty()) {
            return true;
        }
        boolean allOk = true;
        for (MaterialPurchase purchase : purchases) {
            boolean ok = savePurchaseAndUpdateOrder(purchase);
            if (!ok) {
                allOk = false;
            }
        }
        return allOk;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean savePurchaseAndUpdateOrder(MaterialPurchase materialPurchase) {
        // 设置默认值
        LocalDateTime now = LocalDateTime.now();
        materialPurchase.setCreateTime(now);
        materialPurchase.setUpdateTime(now);
        materialPurchase.setDeleteFlag(0);
        materialPurchase.setArrivedQuantity(
                materialPurchase.getArrivedQuantity() == null ? 0 : materialPurchase.getArrivedQuantity());

        if (!StringUtils.hasText(materialPurchase.getPurchaseNo())) {
            materialPurchase.setPurchaseNo(serviceHelper.nextPurchaseNo());
        }

        if (!StringUtils.hasText(materialPurchase.getStatus())) {
            materialPurchase.setStatus(MaterialConstants.STATUS_PENDING);
        }

        if (materialPurchase.getUnitPrice() == null) {
            materialPurchase.setUnitPrice(BigDecimal.ZERO);
        }

        int arrived = materialPurchase.getArrivedQuantity() == null ? 0 : materialPurchase.getArrivedQuantity();
        materialPurchase.setTotalAmount(materialPurchase.getUnitPrice().multiply(BigDecimal.valueOf(arrived)));

        String status = materialPurchase.getStatus() == null ? "" : materialPurchase.getStatus().trim();
        if (!MaterialConstants.STATUS_CANCELLED.equalsIgnoreCase(status)) {
            int purchaseQty = materialPurchase.getPurchaseQuantity() == null ? 0
                    : materialPurchase.getPurchaseQuantity().intValue();
            materialPurchase.setStatus(MaterialPurchaseHelper.resolveStatusByArrived(status, arrived, purchaseQty));
        }

        if ((MaterialConstants.STATUS_COMPLETED.equalsIgnoreCase(materialPurchase.getStatus())
                || MaterialConstants.STATUS_AWAITING_CONFIRM.equalsIgnoreCase(materialPurchase.getStatus()))
                && materialPurchase.getActualArrivalDate() == null) {
            materialPurchase.setActualArrivalDate(now);
        }

        // 确保 unit 字段有值，避免插入失败
        if (!StringUtils.hasText(materialPurchase.getUnit())) {
            materialPurchase.setUnit("-");
        }

        serviceHelper.ensureSnapshot(materialPurchase);

        // 保存物料采购记录
        boolean saved = this.save(materialPurchase);

        // 如果初始保存时就有到货数量，需要同步库存
        // 注意：sourceType="order" 的生产订单驱动采购不写入独立进销存，只有独立采购才写入
        if (saved) {
            int currentArrived = materialPurchase.getArrivedQuantity() == null ? 0
                    : materialPurchase.getArrivedQuantity();
            if (currentArrived > 0 && !isOrderDrivenPurchase(materialPurchase)) {
                try {
                    materialStockService.increaseStock(materialPurchase, currentArrived);
                } catch (Exception e) {
                    log.warn("Failed to init material stock on save: purchaseId={}, error={}", materialPurchase.getId(),
                            e.getMessage());
                }
            }
        }
        return saved;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updatePurchaseAndUpdateOrder(MaterialPurchase materialPurchase) {
        // 获取旧数据以计算库存差异
        MaterialPurchase oldPurchase = null;
        if (StringUtils.hasText(materialPurchase.getId())) {
            oldPurchase = this.getById(materialPurchase.getId());
        }

        // 设置更新时间
        materialPurchase.setUpdateTime(LocalDateTime.now());

        if (!StringUtils.hasText(materialPurchase.getStatus())) {
            materialPurchase.setStatus(MaterialConstants.STATUS_PENDING);
        }

        if (materialPurchase.getUnitPrice() == null) {
            materialPurchase.setUnitPrice(BigDecimal.ZERO);
        }
        int arrived = materialPurchase.getArrivedQuantity() == null ? 0 : materialPurchase.getArrivedQuantity();
        materialPurchase.setTotalAmount(materialPurchase.getUnitPrice().multiply(BigDecimal.valueOf(arrived)));

        String status = materialPurchase.getStatus() == null ? "" : materialPurchase.getStatus().trim();
        if (!MaterialConstants.STATUS_CANCELLED.equalsIgnoreCase(status)) {
            int purchaseQty = materialPurchase.getPurchaseQuantity() == null ? 0
                    : materialPurchase.getPurchaseQuantity().intValue();
            materialPurchase.setStatus(MaterialPurchaseHelper.resolveStatusByArrived(status, arrived, purchaseQty));
        }

        if ((MaterialConstants.STATUS_COMPLETED.equalsIgnoreCase(materialPurchase.getStatus())
                || MaterialConstants.STATUS_AWAITING_CONFIRM.equalsIgnoreCase(materialPurchase.getStatus()))
                && materialPurchase.getActualArrivalDate() == null) {
            materialPurchase.setActualArrivalDate(materialPurchase.getUpdateTime());
        }

        serviceHelper.ensureSnapshot(materialPurchase);

        // 更新物料采购记录
        boolean updated = this.updateById(materialPurchase);

        // 同步库存差异：生产订单驱动的采购（sourceType=order）不写入独立进销存
        if (updated && oldPurchase != null && !isOrderDrivenPurchase(materialPurchase)) {
            int oldArrived = oldPurchase.getArrivedQuantity() == null ? 0 : oldPurchase.getArrivedQuantity();
            int newArrived = arrived;
            int delta = newArrived - oldArrived;
            if (delta != 0) {
                try {
                    materialStockService.increaseStock(materialPurchase, delta);
                } catch (Exception e) {
                    log.warn("Failed to sync material stock on update: purchaseId={}, delta={}, error={}",
                            materialPurchase.getId(), delta, e.getMessage());
                    throw new RuntimeException("库存同步失败", e);
                }
            }
        }

        return updated;
    }

    @Override
    public ArrivalStats computeArrivalStatsByOrderId(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        ArrivalStats out = new ArrivalStats();
        out.setPlannedQty(0);
        out.setArrivedQty(0);
        out.setEffectiveArrivedQty(0);
        out.setPlannedAmount(BigDecimal.ZERO);
        out.setArrivedAmount(BigDecimal.ZERO);
        out.setArrivalRate(0);
        if (!StringUtils.hasText(oid)) {
            return out;
        }

        List<MaterialPurchase> list = this.list(new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getOrderId, oid)
                .eq(MaterialPurchase::getDeleteFlag, 0));
        return computeArrivalStats(list);
    }

    @Override
    public int computeEffectiveArrivedQuantity(int purchaseQty, int arrivedQty) {
        if (purchaseQty <= 0) {
            return 0;
        }

        int aq = Math.max(0, arrivedQty);
        return Math.min(aq, purchaseQty);
    }

    @Override
    public int sumConfirmedQuantityByOrderId(String orderId, boolean fabricOnly) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return 0;
        }
        List<MaterialPurchase> purchases = this.list(new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getOrderId, oid)
                .eq(MaterialPurchase::getDeleteFlag, 0));
        int total = 0;
        for (MaterialPurchase purchase : purchases) {
            if (purchase == null) {
                continue;
            }
            String status = StringUtils.hasText(purchase.getStatus()) ? purchase.getStatus().trim() : "";
            if ("cancelled".equalsIgnoreCase(status)) {
                continue;
            }
            if (fabricOnly) {
                String type = MaterialPurchaseHelper.normalizeMaterialType(purchase.getMaterialType());
                if (!type.startsWith(MaterialConstants.TYPE_FABRIC)) {
                    continue;
                }
            }
            if (purchase.getReturnConfirmed() == null || purchase.getReturnConfirmed() != 1) {
                continue;
            }
            total += Math.max(0, purchase.getReturnQuantity() == null ? 0 : purchase.getReturnQuantity());
        }
        return total;
    }

    @Override
    public boolean hasConfirmedQuantityByOrderId(String orderId, boolean fabricOnly) {
        return sumConfirmedQuantityByOrderId(orderId, fabricOnly) > 0;
    }

    @Override
    public ArrivalStats computeArrivalStats(List<MaterialPurchase> purchases) {
        ArrivalStats out = new ArrivalStats();
        int plannedQty = 0;
        int arrivedQty = 0;
        int effectiveArrivedQty = 0;
        BigDecimal plannedAmount = BigDecimal.ZERO;
        BigDecimal arrivedAmount = BigDecimal.ZERO;

        if (purchases != null) {
            for (MaterialPurchase p : purchases) {
                if (p == null) {
                    continue;
                }
                String st = p.getStatus() == null ? "" : p.getStatus().trim();
                if ("cancelled".equalsIgnoreCase(st)) {
                    continue;
                }
                int pq = p.getPurchaseQuantity() == null ? 0 : p.getPurchaseQuantity().intValue();
                int aq = p.getArrivedQuantity() == null ? 0 : p.getArrivedQuantity();
                if (pq <= 0) {
                    continue;
                }

                int clampedArrived = Math.min(Math.max(0, aq), pq);
                int eff = computeEffectiveArrivedQuantity(pq, aq);

                plannedQty += pq;
                arrivedQty += clampedArrived;
                effectiveArrivedQty += eff;

                BigDecimal up = p.getUnitPrice();
                if (up != null) {
                    if (pq > 0) {
                        plannedAmount = plannedAmount.add(up.multiply(BigDecimal.valueOf(pq)));
                    }
                    if (eff > 0) {
                        arrivedAmount = arrivedAmount.add(up.multiply(BigDecimal.valueOf(eff)));
                    }
                } else {
                    BigDecimal ta = p.getTotalAmount();
                    if (ta != null) {
                        arrivedAmount = arrivedAmount.add(ta);
                    }
                }
            }
        }

        int rate = 0;
        if (plannedQty > 0) {
            rate = Math.min(100, (int) Math.round(effectiveArrivedQty * 100.0 / plannedQty));
        }

        out.setPlannedQty(Math.max(0, plannedQty));
        out.setArrivedQty(Math.max(0, arrivedQty));
        out.setEffectiveArrivedQty(Math.max(0, effectiveArrivedQty));
        out.setPlannedAmount(plannedAmount.setScale(2, RoundingMode.HALF_UP));
        out.setArrivedAmount(arrivedAmount.setScale(2, RoundingMode.HALF_UP));
        out.setArrivalRate(Math.max(0, rate));
        return out;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateArrivedQuantity(String id, Integer arrivedQuantity, String remark) {
        // 查询物料采购记录
        // 注意：在同一事务中，getById 可能返回缓存对象。如果 updateById 未能刷新缓存，或者对象是同一个引用，
        // 这里的 oldArrived 可能已经是上次 updateArrivedQuantity 设置的新值。
        // 但 updateArrivedQuantity 调用了 updateById，应该会更新数据库。

        // 问题在于：
        // 1. 测试用例第一次调用 updateArrivedQuantity(..., 50, ...)
        // -> getById: arrived=0
        // -> setArrived(50)
        // -> updateById(...) -> 提交到 DB (或 flush 到 session)
        // -> materialPurchase 对象引用被修改为 arrived=50

        // 2. 测试用例第二次调用 updateArrivedQuantity(..., 80, ...)
        // -> getById: 如果 MyBatis 一级缓存生效，且是同一个 SqlSession，它可能返回同一个 materialPurchase 引用
        // (arrived=50)
        // -> oldArrived = 50
        // -> delta = 80 - 50 = 30
        // -> setArrived(80)
        // -> updateById(...)
        // -> stock +30 -> stock = 50 + 30 = 80. 正确。

        // 3. 测试用例第三次调用 updateArrivedQuantity(..., 70, ...)
        // -> getById: 拿到引用 (arrived=80)
        // -> oldArrived = 80
        // -> delta = 70 - 80 = -10
        // -> setArrived(70)
        // -> updateById(...)
        // -> stock -10 -> stock = 80 - 10 = 70. 正确。

        // 那么为什么测试失败，显示 stock=80 呢？
        // 说明第三步没有扣减库存。
        // 可能原因：
        // A. delta 计算错误 (oldArrived 不对)
        // B. increaseStock 没有执行
        // C. increaseStock 执行了但没生效

        // 让我们加点日志
        MaterialPurchase materialPurchase = this.getById(id);
        if (materialPurchase == null) {
            return false;
        }

        int oldArrived = materialPurchase.getArrivedQuantity() == null ? 0 : materialPurchase.getArrivedQuantity();
        int newArrived = arrivedQuantity == null ? 0 : arrivedQuantity;
        int delta = newArrived - oldArrived;

        log.info("updateArrivedQuantity: id={}, old={}, new={}, delta={}", id, oldArrived, newArrived, delta);

        // 如果没有变化，直接返回true
        if (delta == 0 && !StringUtils.hasText(remark)) {
            return true;
        }

        // 更新到货数量
        materialPurchase.setArrivedQuantity(newArrived);
        materialPurchase.setUpdateTime(LocalDateTime.now());

        if (StringUtils.hasText(remark)) {
            String current = materialPurchase.getRemark() == null ? "" : materialPurchase.getRemark().trim();
            String next = remark.trim();
            if (StringUtils.hasText(current)) {
                if (!current.contains(next)) {
                    materialPurchase.setRemark(current + "；" + next);
                }
            } else {
                materialPurchase.setRemark(next);
            }
        }

        if (materialPurchase.getUnitPrice() != null) {
            materialPurchase.setTotalAmount(materialPurchase.getUnitPrice().multiply(BigDecimal.valueOf(newArrived)));
        }

        String currentStatus = materialPurchase.getStatus() == null ? "" : materialPurchase.getStatus().trim();
        if (!"cancelled".equals(currentStatus)) {
            int purchaseQty = materialPurchase.getPurchaseQuantity() == null ? 0
                    : materialPurchase.getPurchaseQuantity().intValue();
            String nextStatus = MaterialPurchaseHelper.resolveStatusByArrived(currentStatus, newArrived, purchaseQty);
            materialPurchase.setStatus(nextStatus);
            if ("completed".equalsIgnoreCase(nextStatus) && materialPurchase.getActualArrivalDate() == null) {
                materialPurchase.setActualArrivalDate(LocalDateTime.now());
            }
        }

        // 确保 unit 字段有值，避免插入失败
        if (!StringUtils.hasText(materialPurchase.getUnit())) {
            materialPurchase.setUnit("-");
        }

        // 同步库存（生产订单驱动的采购不写入独立进销存）
        if (delta != 0 && !isOrderDrivenPurchase(materialPurchase)) {
            try {
                materialStockService.increaseStock(materialPurchase, delta);
            } catch (Exception e) {
                log.warn("Failed to sync material stock: purchaseId={}, delta={}, error={}", id, delta, e.getMessage());
                throw new RuntimeException("库存同步失败", e);
            }
        }

        // 更新物料采购记录
        return this.updateById(materialPurchase);
    }

    @Override
    public List<MaterialPurchase> previewDemandByOrderId(String orderId) {
        return serviceHelper.buildDemandItems(orderId, this);
    }

    @Override
    public List<MaterialPurchase> generateDemandByOrderId(String orderId, boolean overwrite) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("orderId不能为空");
        }

        long exists = this.count(new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getOrderId, orderId)
                .eq(MaterialPurchase::getDeleteFlag, 0));
        if (exists > 0 && !overwrite) {
            throw new IllegalStateException("该订单已生成采购需求");
        }

        if (exists > 0 && overwrite) {
            this.remove(new LambdaQueryWrapper<MaterialPurchase>()
                    .eq(MaterialPurchase::getOrderId, orderId));
        }

        List<MaterialPurchase> items = serviceHelper.buildDemandItems(orderId, this);
        for (MaterialPurchase item : items) {
            savePurchaseAndUpdateOrder(item);
        }
        return items;
    }

    @Override
    public boolean receivePurchase(String purchaseId, String receiverId, String receiverName) {
        if (!StringUtils.hasText(purchaseId)) {
            return false;
        }
        MaterialPurchase existed = this.getById(purchaseId);
        if (existed == null) {
            return false;
        }
        if (existed.getDeleteFlag() != null && existed.getDeleteFlag() != 0) {
            return false;
        }

        String status = existed.getStatus() == null ? "" : existed.getStatus().trim();
        String normalizedStatus = status.toLowerCase();
        if (MaterialConstants.STATUS_COMPLETED.equals(normalizedStatus) || MaterialConstants.STATUS_AWAITING_CONFIRM.equals(normalizedStatus) || MaterialConstants.STATUS_CANCELLED.equals(normalizedStatus)) {
            return false;
        }

        String rid = StringUtils.hasText(receiverId) ? receiverId.trim() : null;
        String rname = StringUtils.hasText(receiverName) ? receiverName.trim() : null;
        boolean pending = MaterialConstants.STATUS_PENDING.equals(normalizedStatus) || !StringUtils.hasText(normalizedStatus);
        if (!pending) {
            return serviceHelper.isSameReceiver(existed, rid, rname);
        }

        String who = StringUtils.hasText(receiverName) ? receiverName.trim()
                : (StringUtils.hasText(receiverId) ? receiverId.trim() : "");
        if (!StringUtils.hasText(who)) {
            who = "未命名";
        }

        LocalDateTime now = LocalDateTime.now();
        String finalReceiverName = StringUtils.hasText(rname) ? rname : who;
        LambdaUpdateWrapper<MaterialPurchase> uw = new LambdaUpdateWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getId, purchaseId)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .and(w -> w.eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
                        .or()
                        .eq(MaterialPurchase::getStatus, "PENDING")
                        .or()
                        .isNull(MaterialPurchase::getStatus)
                        .or()
                        .eq(MaterialPurchase::getStatus, ""))
                .set(MaterialPurchase::getReceiverId, rid)
                .set(MaterialPurchase::getReceiverName, finalReceiverName)
                .set(MaterialPurchase::getReceivedTime, now)
                .set(MaterialPurchase::getUpdateTime, now)
                .set(MaterialPurchase::getStatus, MaterialConstants.STATUS_RECEIVED);

        boolean updated = this.update(uw);
        if (updated) {
            return true;
        }

        MaterialPurchase latest = this.getById(purchaseId);
        if (latest == null) {
            return false;
        }
        return serviceHelper.isSameReceiver(latest, rid, rname);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmReturnPurchase(String purchaseId, String confirmerId, String confirmerName,
            Integer returnQuantity) {
        if (!StringUtils.hasText(purchaseId)) {
            return false;
        }
        MaterialPurchase existed = this.getById(purchaseId);
        if (existed == null) {
            return false;
        }
        if (existed.getDeleteFlag() != null && existed.getDeleteFlag() != 0) {
            return false;
        }

        String status = existed.getStatus() == null ? "" : existed.getStatus().trim();
        if (MaterialConstants.STATUS_CANCELLED.equals(status)) {
            return false;
        }

        if (returnQuantity == null) {
            return false;
        }
        int rq = returnQuantity;
        if (rq < 0) {
            return false;
        }
        int purchaseQty = existed.getPurchaseQuantity() == null ? 0 : existed.getPurchaseQuantity().intValue();
        int arrivedQty = existed.getArrivedQuantity() == null ? 0 : existed.getArrivedQuantity();
        int max = arrivedQty > 0 ? arrivedQty : purchaseQty;
        // 数量 ≤ 10 的面料/辅料（按米/克计量），不限制回料数量上限，与 Orchestrator 保持一致
        if (max > 10 && rq > max) {
            return false;
        }

        String who = StringUtils.hasText(confirmerName) ? confirmerName.trim()
                : (StringUtils.hasText(confirmerId) ? confirmerId.trim() : "");
        if (!StringUtils.hasText(who)) {
            who = "未命名";
        }

        String remark = existed.getRemark() == null ? "" : existed.getRemark().trim();

        MaterialPurchase patch = new MaterialPurchase();
        patch.setId(purchaseId);
        patch.setReturnConfirmed(1);
        patch.setReturnQuantity(rq);

        patch.setArrivedQuantity(rq);
        BigDecimal unitPrice = existed.getUnitPrice() == null ? BigDecimal.ZERO : existed.getUnitPrice();
        patch.setTotalAmount(unitPrice.multiply(BigDecimal.valueOf(rq)));

        int pq = existed.getPurchaseQuantity() == null ? 0 : existed.getPurchaseQuantity().intValue();
        patch.setStatus(MaterialPurchaseHelper.resolveStatusByArrived(status, rq, pq));

        patch.setReturnConfirmerId(StringUtils.hasText(confirmerId) ? confirmerId.trim() : null);
        patch.setReturnConfirmerName(StringUtils.hasText(confirmerName) ? confirmerName.trim() : who);
        patch.setReturnConfirmTime(LocalDateTime.now());
        patch.setRemark(remark);
        patch.setUpdateTime(LocalDateTime.now());

        // 同步库存：回料确认时增加库存，生产订单驱动的采购不写入独立进销存
        int delta = rq - arrivedQty;
        if (delta != 0 && !isOrderDrivenPurchase(existed)) {
            try {
                materialStockService.increaseStock(existed, delta);
                log.info("confirmReturnPurchase: 库存同步成功, purchaseId={}, delta={}", purchaseId, delta);
            } catch (Exception e) {
                log.warn("confirmReturnPurchase: 库存同步失败(非致命), purchaseId={}, delta={}, error={}", purchaseId, delta, e.getMessage());
                // 不阻断主流程 — 与 syncAfterPurchaseChanged 保持一致，库存同步失败不影响回料确认业务
            }
        }

        return this.updateById(patch);
    }

    @Override
    public boolean resetReturnConfirm(String purchaseId, String reason, String operatorId, String operatorName) {
        if (!StringUtils.hasText(purchaseId)) {
            return false;
        }
        MaterialPurchase existed = this.getById(purchaseId);
        if (existed == null) {
            return false;
        }
        if (existed.getDeleteFlag() != null && existed.getDeleteFlag() != 0) {
            return false;
        }
        if (existed.getReturnConfirmed() == null || existed.getReturnConfirmed() != 1) {
            return false;
        }

        String who = StringUtils.hasText(operatorName) ? operatorName.trim()
                : (StringUtils.hasText(operatorId) ? operatorId.trim() : "");
        if (!StringUtils.hasText(who)) {
            who = "未命名";
        }

        String prefix = "回料退回:";
        String remark = existed.getRemark() == null ? "" : existed.getRemark().trim();
        String time = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
        String r = StringUtils.hasText(reason) ? reason.trim() : "";
        String add = r.isEmpty() ? (prefix + who + " " + time) : (prefix + who + " " + time + " 原因:" + r);
        remark = remark.isEmpty() ? add : (remark + "；" + add);

        // ⚠️ 用 LambdaUpdateWrapper 显式 SET NULL
        LambdaUpdateWrapper<MaterialPurchase> retConfirmUw = new LambdaUpdateWrapper<>();
        retConfirmUw.eq(MaterialPurchase::getId, purchaseId)
                    .set(MaterialPurchase::getReturnConfirmed, 0)
                    .set(MaterialPurchase::getReturnQuantity, null)
                    .set(MaterialPurchase::getReturnConfirmerId, null)
                    .set(MaterialPurchase::getReturnConfirmerName, null)
                    .set(MaterialPurchase::getReturnConfirmTime, null)
                    .set(MaterialPurchase::getRemark, remark)
                    .set(MaterialPurchase::getUpdateTime, LocalDateTime.now());
        boolean ok = this.update(retConfirmUw);

        if (ok && !isOrderDrivenPurchase(existed)) {
            try {
                Integer returnQty = existed.getReturnQuantity();
                Integer arrivedQty = existed.getArrivedQuantity();
                if (returnQty != null && returnQty > 0 && arrivedQty != null) {
                    int delta = returnQty - arrivedQty;
                    if (delta > 0) {
                        materialStockService.decreaseStockForCancelReceive(existed, delta);
                        log.info("resetReturnConfirm 已回退库存: purchaseId={}, delta={}", purchaseId, delta);
                    }
                }
            } catch (Exception e) {
                log.warn("resetReturnConfirm 回退库存失败（不影响主流程）: purchaseId={}, err={}", purchaseId, e.getMessage());
            }
        }

        return ok;
    }

    /**
     * 判断是否为生产订单驱动的采购（sourceType="order" 或 "sample"）
     * 生产订单驱动的采购到货不应写入独立进销存（MaterialStock），
     * 独立进销存只记录独立提前采购的库存。
     */
    private boolean isOrderDrivenPurchase(MaterialPurchase purchase) {
        if (purchase == null) return false;
        String sourceType = purchase.getSourceType();
        return "order".equals(sourceType) || "sample".equals(sourceType);
    }
}
