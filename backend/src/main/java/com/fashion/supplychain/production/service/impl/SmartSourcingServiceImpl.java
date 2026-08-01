package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.SupplierScorecardOrchestrator;
import com.fashion.supplychain.production.dto.AddCartItemRequest;
import com.fashion.supplychain.production.dto.BatchAddItemResultDto;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.service.PurchaseCartService;
import com.fashion.supplychain.production.service.SmartSourcingService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleBomMapper;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.mapper.FactoryMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/**
 * 智能采购推荐服务实现
 *
 * <p>计算链路：BOM需求(usageAmount × orderQty × (1+lossRate%)) - 可用库存 - 在途采购 = 净需求
 * <p>仅净需求>0的物料推送到购物车草稿，供应商优先取BOM指定，其次推荐S/A级供应商
 * <p>事务边界在 PurchaseCartOrchestrator.addItem 层（本Service不加@Transactional）
 */
@Service
@Slf4j
public class SmartSourcingServiceImpl implements SmartSourcingService {

    @Autowired
    private StyleInfoMapper styleInfoMapper;

    @Autowired
    private StyleBomMapper styleBomMapper;

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private MaterialStockMapper materialStockMapper;

    @Autowired
    private MaterialPurchaseMapper materialPurchaseMapper;

    @Autowired
    private FactoryMapper factoryMapper;

    @Autowired
    @Lazy
    private PurchaseCartService purchaseCartService;

    @Autowired
    @Lazy
    private SupplierScorecardOrchestrator supplierScorecardOrchestrator;

    @Override
    public Map<String, Object> generateSourcingForOrder(Long tenantId, String orderNo) {
        if (tenantId == null) {
            throw new BusinessException("租户ID不能为空");
        }
        if (!StringUtils.hasText(orderNo)) {
            throw new BusinessException("订单号不能为空");
        }

        ProductionOrder order = queryOrder(tenantId, orderNo);
        StyleInfo style = queryStyle(tenantId, order.getStyleNo());
        List<StyleBom> bomList = queryBomList(tenantId, style);

        List<Map<String, Object>> details = buildNetDemandDetails(tenantId, order, bomList);

        List<AddCartItemRequest> cartRequests = new ArrayList<>();
        int skippedNoDemand = 0;
        for (Map<String, Object> detail : details) {
            BigDecimal netDemand = (BigDecimal) detail.get("netDemand");
            if (netDemand == null || netDemand.compareTo(BigDecimal.ZERO) <= 0) {
                skippedNoDemand++;
                continue;
            }
            StyleBom bom = (StyleBom) detail.get("bomItem");
            Factory supplier = recommendSupplier(tenantId, bom);
            cartRequests.add(buildCartRequest(order, style, bom, detail, supplier));
        }

        String cartUserId = resolveCartUserId();
        BatchAddItemResultDto batchResult = null;
        if (!cartRequests.isEmpty()) {
            batchResult = purchaseCartService.batchAddItems(tenantId, cartUserId, cartRequests);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderNo", orderNo);
        result.put("styleNo", order.getStyleNo());
        result.put("styleName", order.getStyleName());
        result.put("orderQuantity", order.getOrderQuantity());
        result.put("totalBomItems", bomList.size());
        result.put("netDemandItems", details.size() - skippedNoDemand);
        result.put("skippedNoDemand", skippedNoDemand);
        result.put("pushedToCart", cartRequests.size());
        result.put("cartUserId", cartUserId);
        if (batchResult != null) {
            result.put("batchResult", batchResult);
        }
        return result;
    }

    @Override
    public Map<String, Object> generateSourcingForOrders(Long tenantId, List<String> orderNos) {
        if (tenantId == null) {
            throw new BusinessException("租户ID不能为空");
        }
        if (orderNos == null || orderNos.isEmpty()) {
            throw new BusinessException("订单号列表不能为空");
        }

        int totalPushed = 0;
        int totalSkipped = 0;
        int totalBomItems = 0;
        List<Map<String, Object>> orderResults = new ArrayList<>();
        List<String> failedOrders = new ArrayList<>();

        for (String orderNo : orderNos) {
            try {
                Map<String, Object> singleResult = generateSourcingForOrder(tenantId, orderNo);
                orderResults.add(singleResult);
                totalPushed += (Integer) singleResult.getOrDefault("pushedToCart", 0);
                totalSkipped += (Integer) singleResult.getOrDefault("skippedNoDemand", 0);
                totalBomItems += (Integer) singleResult.getOrDefault("totalBomItems", 0);
            } catch (Exception e) {
                log.warn("[智能采购] 订单{}生成失败: {}", orderNo, e.getMessage());
                failedOrders.add(orderNo + ": " + e.getMessage());
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalOrders", orderNos.size());
        result.put("successOrders", orderNos.size() - failedOrders.size());
        result.put("failedOrders", failedOrders);
        result.put("totalBomItems", totalBomItems);
        result.put("totalPushedToCart", totalPushed);
        result.put("totalSkippedNoDemand", totalSkipped);
        result.put("orderDetails", orderResults);
        return result;
    }

    @Override
    public List<Map<String, Object>> calculateNetDemand(Long tenantId, String orderNo) {
        if (tenantId == null) {
            throw new BusinessException("租户ID不能为空");
        }
        if (!StringUtils.hasText(orderNo)) {
            throw new BusinessException("订单号不能为空");
        }

        ProductionOrder order = queryOrder(tenantId, orderNo);
        StyleInfo style = queryStyle(tenantId, order.getStyleNo());
        List<StyleBom> bomList = queryBomList(tenantId, style);

        return buildNetDemandDetails(tenantId, order, bomList);
    }

    // ==================== 私有辅助方法 ====================

    private ProductionOrder queryOrder(Long tenantId, String orderNo) {
        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProductionOrder::getOrderNo, orderNo)
               .eq(ProductionOrder::getTenantId, tenantId)
               .eq(ProductionOrder::getDeleteFlag, 0)
               .last("LIMIT 1");
        ProductionOrder order = productionOrderMapper.selectOne(wrapper);
        if (order == null) {
            throw new BusinessException("生产订单不存在: " + orderNo);
        }
        return order;
    }

    private StyleInfo queryStyle(Long tenantId, String styleNo) {
        if (!StringUtils.hasText(styleNo)) {
            return null;
        }
        LambdaQueryWrapper<StyleInfo> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StyleInfo::getStyleNo, styleNo)
               .eq(StyleInfo::getTenantId, tenantId)
               .eq(StyleInfo::getDeleteFlag, 0)
               .last("LIMIT 1");
        return styleInfoMapper.selectOne(wrapper);
    }

    private List<StyleBom> queryBomList(Long tenantId, StyleInfo style) {
        if (style == null || style.getId() == null) {
            return Collections.emptyList();
        }
        LambdaQueryWrapper<StyleBom> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StyleBom::getStyleId, style.getId())
               .eq(StyleBom::getTenantId, tenantId);
        return styleBomMapper.selectList(wrapper);
    }

    /**
     * 构建物料净需求明细列表
     *
     * @return 每个BOM项对应一个Map，含 demand/availableStock/inTransit/netDemand/bomItem
     */
    private List<Map<String, Object>> buildNetDemandDetails(Long tenantId,
                                                            ProductionOrder order,
                                                            List<StyleBom> bomList) {
        Integer orderQty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
        List<Map<String, Object>> details = new ArrayList<>();

        for (StyleBom bom : bomList) {
            if (!StringUtils.hasText(bom.getMaterialCode())) {
                continue;
            }

            BigDecimal usageAmount = bom.getUsageAmount() != null ? bom.getUsageAmount() : BigDecimal.ZERO;
            BigDecimal lossRate = bom.getLossRate() != null ? bom.getLossRate() : BigDecimal.ZERO;
            BigDecimal demand = usageAmount
                    .multiply(BigDecimal.valueOf(orderQty))
                    .multiply(BigDecimal.ONE.add(lossRate.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP)));

            int availableStock = queryAvailableStock(tenantId, bom.getMaterialCode());
            BigDecimal inTransit = queryInTransitQuantity(tenantId, bom.getMaterialCode());

            BigDecimal netDemand = demand
                    .subtract(BigDecimal.valueOf(availableStock))
                    .subtract(inTransit)
                    .max(BigDecimal.ZERO);

            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("materialCode", bom.getMaterialCode());
            detail.put("materialName", bom.getMaterialName());
            detail.put("materialType", bom.getMaterialType());
            detail.put("specification", bom.getSpecification());
            detail.put("unit", bom.getUnit());
            detail.put("color", bom.getColor());
            detail.put("bomUsageAmount", usageAmount);
            detail.put("orderQuantity", orderQty);
            detail.put("lossRate", lossRate);
            detail.put("demand", demand.setScale(4, RoundingMode.HALF_UP));
            detail.put("availableStock", availableStock);
            detail.put("inTransit", inTransit.setScale(4, RoundingMode.HALF_UP));
            detail.put("netDemand", netDemand.setScale(4, RoundingMode.HALF_UP));
            detail.put("needPurchase", netDemand.compareTo(BigDecimal.ZERO) > 0);
            detail.put("bomItem", bom);
            details.add(detail);
        }
        return details;
    }

    /**
     * 查询物料可用库存（quantity - lockedQuantity 之和）
     */
    private int queryAvailableStock(Long tenantId, String materialCode) {
        LambdaQueryWrapper<MaterialStock> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialStock::getMaterialCode, materialCode)
               .eq(MaterialStock::getTenantId, tenantId)
               .eq(MaterialStock::getDeleteFlag, 0);
        List<MaterialStock> stocks = materialStockMapper.selectList(wrapper);
        return stocks.stream()
                .mapToInt(s -> (s.getQuantity() != null ? s.getQuantity() : 0)
                        - (s.getLockedQuantity() != null ? s.getLockedQuantity() : 0))
                .sum();
    }

    /**
     * 查询在途采购数量（purchaseQuantity - arrivedQuantity，排除已完成/已取消）
     */
    private BigDecimal queryInTransitQuantity(Long tenantId, String materialCode) {
        LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialPurchase::getMaterialCode, materialCode)
               .eq(MaterialPurchase::getTenantId, tenantId)
               .eq(MaterialPurchase::getDeleteFlag, 0)
               .notIn(MaterialPurchase::getStatus, "completed", "cancelled");
        List<MaterialPurchase> purchases = materialPurchaseMapper.selectList(wrapper);
        return purchases.stream()
                .map(p -> {
                    BigDecimal purchased = p.getPurchaseQuantity() != null
                            ? p.getPurchaseQuantity() : BigDecimal.ZERO;
                    int arrived = p.getArrivedQuantity() != null ? p.getArrivedQuantity() : 0;
                    return purchased.subtract(BigDecimal.valueOf(arrived)).max(BigDecimal.ZERO);
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * 推荐供应商：优先BOM指定，其次S/A级，再次任意活跃面辅料供应商
     */
    private Factory recommendSupplier(Long tenantId, StyleBom bom) {
        // 1. 优先使用BOM指定的供应商
        if (StringUtils.hasText(bom.getSupplierId())) {
            Factory factory = factoryMapper.selectById(bom.getSupplierId());
            if (factory != null
                    && factory.getTenantId() != null
                    && factory.getTenantId().equals(tenantId)
                    && !"inactive".equals(factory.getStatus())) {
                return factory;
            }
        }

        // 2. 查询S/A级面辅料供应商（按综合评分降序）
        Factory recommended = queryFactoryByTier(tenantId, Arrays.asList("S", "A"));
        if (recommended != null) {
            return recommended;
        }

        // 3. 兜底：任意活跃面辅料供应商（按综合评分降序）
        return queryFactoryByTier(tenantId, null);
    }

    private Factory queryFactoryByTier(Long tenantId, List<String> tiers) {
        LambdaQueryWrapper<Factory> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Factory::getTenantId, tenantId)
               .eq(Factory::getDeleteFlag, 0)
               .eq(Factory::getStatus, "active")
               .eq(Factory::getSupplierType, "MATERIAL");
        if (tiers != null && !tiers.isEmpty()) {
            wrapper.in(Factory::getSupplierTier, tiers);
        }
        wrapper.orderByDesc(Factory::getOverallScore)
               .last("LIMIT 1");
        return factoryMapper.selectOne(wrapper);
    }

    private AddCartItemRequest buildCartRequest(ProductionOrder order, StyleInfo style,
                                                StyleBom bom, Map<String, Object> detail,
                                                Factory supplier) {
        AddCartItemRequest req = new AddCartItemRequest();
        req.setMaterialCode(bom.getMaterialCode());
        req.setMaterialName(bom.getMaterialName());
        req.setMaterialType(bom.getMaterialType());
        req.setSpecifications(bom.getSpecification());
        req.setUnit(bom.getUnit());
        BigDecimal netDemand = (BigDecimal) detail.get("netDemand");
        req.setQuantity(netDemand.setScale(2, RoundingMode.HALF_UP));
        req.setUnitPrice(bom.getUnitPrice());

        if (supplier != null) {
            req.setSupplierId(supplier.getId());
            req.setSupplierName(supplier.getFactoryName());
        } else if (StringUtils.hasText(bom.getSupplierId())) {
            req.setSupplierId(bom.getSupplierId());
        }

        req.setSourceType("order");
        req.setSourceId(order.getId());
        req.setSourceNo(order.getOrderNo());
        req.setSourceQuantity(BigDecimal.valueOf(
                order.getOrderQuantity() != null ? order.getOrderQuantity() : 0));
        req.setColor(bom.getColor());
        req.setFabricComposition(bom.getFabricComposition());
        req.setFabricWeight(bom.getFabricWeight());
        // 持久化损耗率到采购链路，便于生成采购单后追溯
        req.setLossRate(bom.getLossRate() != null ? bom.getLossRate() : BigDecimal.ZERO);

        if (style != null) {
            req.setStyleId(String.valueOf(style.getId()));
            req.setStyleImageUrl(style.getCover());
        }
        req.setStyleNo(order.getStyleNo());

        BigDecimal demand = (BigDecimal) detail.get("demand");
        Integer availableStock = (Integer) detail.get("availableStock");
        BigDecimal inTransit = (BigDecimal) detail.get("inTransit");
        req.setRemark(String.format("智能采购推荐：净需求=%s（BOM需求=%s - 库存=%d - 在途=%s）",
                netDemand.setScale(2, RoundingMode.HALF_UP),
                demand.setScale(2, RoundingMode.HALF_UP),
                availableStock,
                inTransit.setScale(2, RoundingMode.HALF_UP)));
        return req;
    }

    /**
     * 解析购物车用户ID：巡检线程中可能为null或"system"，统一用"system"
     */
    private String resolveCartUserId() {
        String userId = UserContext.userId();
        if (!StringUtils.hasText(userId) || "system".equals(userId)) {
            return "system";
        }
        return userId;
    }
}
