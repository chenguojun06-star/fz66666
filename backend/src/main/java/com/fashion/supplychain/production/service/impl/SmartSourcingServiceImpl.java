package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.SupplierScorecardOrchestrator;
import com.fashion.supplychain.production.dto.AddCartItemRequest;
import com.fashion.supplychain.production.dto.BatchAddItemResultDto;
import com.fashion.supplychain.production.dto.smart.*;
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
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.stream.Collectors;

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

    // ========== 升级方案A：本地2h缓存（Caffeine），每租户独立Key ==========
    /** 订单概览缓存 Key: smart-overview:{tenantId}:{orderNo} */
    private final Cache<String, OrderOverviewDto> overviewCache = Caffeine.newBuilder()
            .maximumSize(500)
            .expireAfterWrite(2, TimeUnit.HOURS)
            .recordStats()
            .build();

    /** 订单明细缓存 Key: smart-detail:{tenantId}:{orderNo} */
    private final Cache<String, List<Map<String, Object>>> detailCache = Caffeine.newBuilder()
            .maximumSize(500)
            .expireAfterWrite(2, TimeUnit.HOURS)
            .recordStats()
            .build();

    private static String overviewCacheKey(Long tenantId, String orderNo) {
        return "smart-overview:" + tenantId + ":" + orderNo;
    }
    private static String detailCacheKey(Long tenantId, String orderNo) {
        return "smart-detail:" + tenantId + ":" + orderNo;
    }

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
     * 构建物料净需求明细列表（含智能推荐：供应商详情、历史采购价、推荐理由）
     *
     * @return 每个BOM项对应一个Map，含需求/库存/在途/净需求/推荐供应商/历史采购价/推荐理由
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

            // 智能推荐供应商
            Factory supplier = recommendSupplier(tenantId, bom);

            // 历史采购价（最近一次）
            Map<String, Object> lastPurchase = queryLastPurchasePrice(tenantId, bom.getMaterialCode());

            // 推荐理由
            String reason = buildRecommendReason(demand, availableStock, inTransit, netDemand, bom, supplier, lastPurchase);

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

            // ── 智能推荐字段 ──
            detail.put("bomUnitPrice", bom.getUnitPrice());
            Map<String, Object> supplierInfo = new LinkedHashMap<>();
            if (supplier != null) {
                supplierInfo.put("supplierId", supplier.getId());
                supplierInfo.put("supplierName", supplier.getFactoryName());
                supplierInfo.put("supplierTier", supplier.getSupplierTier());
                supplierInfo.put("overallScore", supplier.getOverallScore());
                supplierInfo.put("qualityScore", supplier.getQualityScore());
                supplierInfo.put("contactPhone", supplier.getContactPhone());
                supplierInfo.put("isBomDesignated",
                        StringUtils.hasText(bom.getSupplierId())
                                && bom.getSupplierId().equals(String.valueOf(supplier.getId())));
            }
            detail.put("recommendedSupplier", supplierInfo);
            detail.put("lastPurchasePrice", lastPurchase.get("unitPrice"));
            detail.put("lastPurchaseTime", lastPurchase.get("createTime"));
            detail.put("lastPurchaseSupplier", lastPurchase.get("supplierName"));
            detail.put("recommendReason", reason);
            // 价格对比提示
            BigDecimal lastPrice = (BigDecimal) lastPurchase.get("unitPrice");
            String priceAlert = null;
            if (lastPrice != null && bom.getUnitPrice() != null && lastPrice.compareTo(bom.getUnitPrice()) != 0) {
                priceAlert = lastPrice.compareTo(bom.getUnitPrice()) > 0
                        ? "历史采购价高于BOM预估" : "历史采购价低于BOM预估";
            }
            detail.put("priceAlert", priceAlert);

            details.add(detail);
        }
        return details;
    }

    /**
     * 查询物料最近一次采购记录（用于历史采购价参考）
     */
    private Map<String, Object> queryLastPurchasePrice(Long tenantId, String materialCode) {
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(MaterialPurchase::getMaterialCode, materialCode)
                   .eq(MaterialPurchase::getTenantId, tenantId)
                   .eq(MaterialPurchase::getDeleteFlag, 0)
                   .isNotNull(MaterialPurchase::getUnitPrice)
                   .orderByDesc(MaterialPurchase::getCreateTime)
                   .last("LIMIT 1");
            MaterialPurchase purchase = materialPurchaseMapper.selectOne(wrapper);
            if (purchase != null) {
                result.put("unitPrice", purchase.getUnitPrice());
                result.put("createTime", purchase.getCreateTime());
                result.put("supplierName", purchase.getSupplierName());
            }
        } catch (Exception e) {
            log.warn("[智能采购] 查询历史采购价失败: {}", e.getMessage());
        }
        return result;
    }

    /**
     * 生成智能推荐理由（可解释性：为什么推荐买这个数量、为什么选这个供应商）
     */
    private String buildRecommendReason(BigDecimal demand, int availableStock, BigDecimal inTransit,
                                         BigDecimal netDemand, StyleBom bom, Factory supplier,
                                         Map<String, Object> lastPurchase) {
        if (netDemand == null || netDemand.compareTo(BigDecimal.ZERO) <= 0) {
            return String.format("无需采购：库存%d + 在途%s 可覆盖需求%s",
                    availableStock,
                    inTransit.setScale(2, RoundingMode.HALF_UP),
                    demand.setScale(2, RoundingMode.HALF_UP));
        }

        StringBuilder reason = new StringBuilder();
        reason.append(String.format("需采购%s：需求%s - 库存%d - 在途%s = 净缺%s",
                netDemand.setScale(2, RoundingMode.HALF_UP),
                demand.setScale(2, RoundingMode.HALF_UP),
                availableStock,
                inTransit.setScale(2, RoundingMode.HALF_UP),
                netDemand.setScale(2, RoundingMode.HALF_UP)));

        if (supplier != null) {
            Boolean isBomDesignated = StringUtils.hasText(bom.getSupplierId())
                    && bom.getSupplierId().equals(String.valueOf(supplier.getId()));
            if (isBomDesignated) {
                reason.append("；BOM指定供应商");
            } else if ("S".equals(supplier.getSupplierTier()) || "A".equals(supplier.getSupplierTier())) {
                reason.append(String.format("；推荐%s级供应商（综合评分%s）",
                        supplier.getSupplierTier(),
                        supplier.getOverallScore() != null ? supplier.getOverallScore() : "暂无"));
            } else {
                reason.append(String.format("；推荐供应商（综合评分%s）",
                        supplier.getOverallScore() != null ? supplier.getOverallScore() : "暂无"));
            }
        }

        BigDecimal lastPrice = (BigDecimal) lastPurchase.get("unitPrice");
        if (lastPrice != null && bom.getUnitPrice() != null && lastPrice.compareTo(bom.getUnitPrice()) != 0) {
            reason.append(String.format("；注意：上次采购价%s ≠ BOM预估%s",
                    lastPrice.setScale(2, RoundingMode.HALF_UP),
                    bom.getUnitPrice().setScale(2, RoundingMode.HALF_UP)));
        }

        return reason.toString();
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

    // ==================== 升级方案A：订单列表 + 按需批量计算 + 2h缓存 ====================

    @Override
    public SmartSourcingOrdersPage listOrders(Long tenantId, SmartSourcingFilter filter) {
        if (tenantId == null) throw new BusinessException("租户ID不能为空");
        // 后端硬 clamp，避免前端传过大造成查询压力
        if (filter == null) filter = SmartSourcingFilter.builder().build();
        int pageSize = Math.min(Math.max(1, filter.getPageSize() == null ? 20 : filter.getPageSize()), 50);
        int page = Math.max(1, filter.getPage() == null ? 1 : filter.getPage());
        filter.setPage(page);
        filter.setPageSize(pageSize);

        LambdaQueryWrapper<ProductionOrder> qw = new LambdaQueryWrapper<>();
        qw.eq(ProductionOrder::getTenantId, tenantId);

        // 物料到位率阈值（默认 < 80）
        Integer arrivalRate = filter.getArrivalRateLessThan();
        if (arrivalRate != null && arrivalRate < 100) {
            qw.and(w -> w.lt(ProductionOrder::getMaterialArrivalRate, arrivalRate)
                    .or().isNull(ProductionOrder::getMaterialArrivalRate));
        }

        // 创建时间范围（默认近 60 天；传 null 则不限）
        Integer withinDays = filter.getCreatedWithinDays();
        if (withinDays != null && withinDays > 0) {
            qw.ge(ProductionOrder::getCreateTime, LocalDateTime.now().minus(withinDays, ChronoUnit.DAYS));
        }

        // 只看急单
        if (Boolean.TRUE.equals(filter.getOnlyUrgent())) {
            qw.eq(ProductionOrder::getUrgencyLevel, "urgent");
        }

        // 订单状态：显式statuses优先级高于excludeStatuses
        List<String> statuses = filter.getStatuses();
        if (statuses != null && !statuses.isEmpty()) {
            qw.in(ProductionOrder::getStatus, statuses);
        } else {
            List<String> exclude = filter.getExcludeStatuses();
            if (exclude != null && !exclude.isEmpty()) {
                qw.notIn(ProductionOrder::getStatus, exclude);
            }
        }

        // 关键词搜索（订单号/款号）
        String kw = filter.getSearchKeyword();
        if (StringUtils.hasText(kw)) {
            String like = "%" + kw.trim() + "%";
            qw.and(w -> w.like(ProductionOrder::getOrderNo, like)
                    .or().like(ProductionOrder::getStyleNo, like)
                    .or().like(ProductionOrder::getStyleName, like));
        }

        // 排序
        String sortBy = StringUtils.hasText(filter.getSortBy()) ? filter.getSortBy() : "createTime";
        String sortDir = StringUtils.hasText(filter.getSortDir()) ? filter.getSortDir() : "desc";
        boolean desc = "desc".equalsIgnoreCase(sortDir);
        switch (sortBy) {
            case "plannedEndDate":
                qw.orderBy(true, !desc, ProductionOrder::getPlannedEndDate);
                break;
            case "materialArrivalRate":
                qw.orderBy(true, !desc, ProductionOrder::getMaterialArrivalRate);
                break;
            case "orderQuantity":
                qw.orderBy(true, !desc, ProductionOrder::getOrderQuantity);
                break;
            case "createTime":
            default:
                qw.orderBy(true, !desc, ProductionOrder::getCreateTime);
        }
        // 兜底：再按 id desc，保证分页稳定
        qw.orderByDesc(ProductionOrder::getId);

        // 只选列表需要的列，减少 IO
        qw.select(ProductionOrder::getOrderNo, ProductionOrder::getStyleNo,
                ProductionOrder::getStyleName, ProductionOrder::getStyleCover,
                ProductionOrder::getOrderQuantity, ProductionOrder::getMaterialArrivalRate,
                ProductionOrder::getStatus, ProductionOrder::getCreateTime,
                ProductionOrder::getPlannedEndDate, ProductionOrder::getUrgencyLevel,
                ProductionOrder::getMerchandiser);

        IPage<ProductionOrder> ipage = productionOrderMapper.selectPage(new Page<>(page, pageSize), qw);
        List<OrderBasicDto> list = ipage.getRecords().stream().map(o -> OrderBasicDto.builder()
                .orderNo(o.getOrderNo())
                .styleNo(o.getStyleNo())
                .styleName(o.getStyleName())
                .coverImage(o.getStyleCover() != null ? o.getStyleCover() : o.getCoverImage())
                .orderQuantity(o.getOrderQuantity())
                .materialArrivalRate(o.getMaterialArrivalRate() == null ? 0 : o.getMaterialArrivalRate())
                .status(o.getStatus())
                .createTime(o.getCreateTime())
                .plannedEndDate(o.getPlannedEndDate())
                .urgencyLevel(o.getUrgencyLevel())
                .merchandiser(o.getMerchandiser())
                .build()).collect(Collectors.toList());

        return SmartSourcingOrdersPage.builder()
                .list(list)
                .total(ipage.getTotal())
                .appliedFilter(filter)
                .build();
    }

    @Override
    public SmartSourcingOverviewResponse buildOverviewsBatch(Long tenantId, List<String> orderNos, boolean forceRefresh) {
        if (tenantId == null) throw new BusinessException("租户ID不能为空");
        if (orderNos == null || orderNos.isEmpty()) {
            return SmartSourcingOverviewResponse.builder()
                    .overviews(Collections.emptyMap())
                    .fromCache(Collections.emptyList())
                    .computed(Collections.emptyList())
                    .failed(Collections.emptyMap())
                    .shortageOrderCount(0)
                    .totalShortageAmount(BigDecimal.ZERO)
                    .build();
        }
        // 性能硬保护：一次最多 20 个订单（批量SQL太多IN也会爆）
        List<String> uniqueOrderNos = orderNos.stream().distinct().collect(Collectors.toList());
        if (uniqueOrderNos.size() > 20) {
            throw new BusinessException("单次最多计算20个订单，当前请求" + uniqueOrderNos.size() + "个");
        }

        List<String> fromCacheList = new ArrayList<>();
        List<String> computedList = new ArrayList<>();
        Map<String, String> failedMap = new LinkedHashMap<>();
        Map<String, OrderOverviewDto> overviews = new LinkedHashMap<>();
        LocalDateTime now = LocalDateTime.now();

        // 1) 从缓存走一遍（不强制刷新的情况下），分离出需计算的 ordersNeedCompute
        List<String> ordersNeedCompute = new ArrayList<>();
        for (String orderNo : uniqueOrderNos) {
            if (forceRefresh) {
                ordersNeedCompute.add(orderNo);
                continue;
            }
            OrderOverviewDto cached = overviewCache.getIfPresent(overviewCacheKey(tenantId, orderNo));
            if (cached != null) {
                cached.setFromCache(true);
                overviews.put(orderNo, cached);
                fromCacheList.add(orderNo);
            } else {
                ordersNeedCompute.add(orderNo);
            }
        }

        // 2) ordersNeedCompute 批量计算（8步SQL，见设计文档 §3.3）
        if (!ordersNeedCompute.isEmpty()) {
            try {
                Map<String, OrderOverviewDto> computed = computeOrderOverviews(tenantId, ordersNeedCompute, now);
                for (Map.Entry<String, OrderOverviewDto> e : computed.entrySet()) {
                    String on = e.getKey();
                    OrderOverviewDto ov = e.getValue();
                    ov.setFromCache(false);
                    overviews.put(on, ov);
                    computedList.add(on);
                    // 写缓存（Caffeine本身内存操作极快）
                    overviewCache.put(overviewCacheKey(tenantId, on), ov);
                }
                // 计算成功但 ordersNeedCompute 里没产出的 = 该订单没有BOM或不存在
                for (String on : ordersNeedCompute) {
                    if (!overviews.containsKey(on)) {
                        failedMap.put(on, "订单不存在或未关联BOM，无法计算");
                    }
                }
            } catch (Exception ex) {
                log.warn("[SmartSourcing] batch overview compute failed, orders={}", ordersNeedCompute, ex);
                for (String on : ordersNeedCompute) {
                    failedMap.put(on, "计算异常:" + ex.getMessage());
                }
            }
        }

        // 3) 顶部汇总栏数值
        int shortageCount = 0;
        BigDecimal totalShort = BigDecimal.ZERO;
        for (OrderOverviewDto ov : overviews.values()) {
            if (ov.getShortageCount() > 0) {
                shortageCount++;
                if (ov.getShortageAmount() != null) {
                    totalShort = totalShort.add(ov.getShortageAmount());
                }
            }
        }

        return SmartSourcingOverviewResponse.builder()
                .overviews(overviews)
                .fromCache(fromCacheList)
                .computed(computedList)
                .failed(failedMap)
                .shortageOrderCount(shortageCount)
                .totalShortageAmount(totalShort.setScale(2, RoundingMode.HALF_UP))
                .build();
    }

    @Override
    public List<Map<String, Object>> getOrderDetailCached(Long tenantId, String orderNo, boolean forceRefresh) {
        if (tenantId == null) throw new BusinessException("租户ID不能为空");
        if (!StringUtils.hasText(orderNo)) throw new BusinessException("订单号不能为空");

        String key = detailCacheKey(tenantId, orderNo);
        if (!forceRefresh) {
            List<Map<String, Object>> cached = detailCache.getIfPresent(key);
            if (cached != null) return cached;
        }
        List<Map<String, Object>> detail = calculateNetDemand(tenantId, orderNo);
        detailCache.put(key, detail);
        // 写入明细后，顺便把 overview 也更新（详情页的缺料汇总来自 overview，需要一致）
        try {
            OrderOverviewDto ov = buildOverviewFromDetail(orderNo, detail, LocalDateTime.now());
            overviewCache.put(overviewCacheKey(tenantId, orderNo), ov);
        } catch (Exception ignore) { /* overview secondary */ }
        return detail;
    }

    // ------------------------------------------------------------------
    // 私有辅助：8 步批量SQL计算 订单 → 缺料概览
    //   SQL计数目标：输入 N 订单 → 至多 8 次 SQL，而不是 N×M 次
    //   实际：订单(1) + 款号StyleInfo(1) + StyleBom(1) + 库存聚合(1) + 在途聚合(1) = 5次SQL
    // ------------------------------------------------------------------
    private Map<String, OrderOverviewDto> computeOrderOverviews(Long tenantId,
                                                                List<String> orderNos,
                                                                LocalDateTime computedAt) {
        // Step 1: 批量取订单 → orderNo -> (orderQuantity, styleNo)  [1 SQL]
        Map<String, ProductionOrder> orderMap = new LinkedHashMap<>();
        {
            LambdaQueryWrapper<ProductionOrder> qw = new LambdaQueryWrapper<>();
            qw.eq(ProductionOrder::getTenantId, tenantId)
                    .in(ProductionOrder::getOrderNo, orderNos)
                    .select(ProductionOrder::getOrderNo, ProductionOrder::getOrderQuantity,
                            ProductionOrder::getStyleNo, ProductionOrder::getStyleName);
            List<ProductionOrder> orders = productionOrderMapper.selectList(qw);
            for (ProductionOrder o : orders) orderMap.put(o.getOrderNo(), o);
        }
        if (orderMap.isEmpty()) return Collections.emptyMap();

        Set<String> styleNos = orderMap.values().stream()
                .map(ProductionOrder::getStyleNo).filter(StringUtils::hasText)
                .collect(Collectors.toSet());

        // Step 1.5: 批量查 StyleInfo（styleNo → styleId）→ 1 SQL
        // StyleBom 存 styleId（Long），不存 styleNo（String），所以必须先走 StyleInfo 桥接
        Map<String, StyleInfo> styleInfoByNo = new HashMap<>();
        Map<Long, String> styleNoById = new HashMap<>();
        if (!styleNos.isEmpty()) {
            LambdaQueryWrapper<StyleInfo> siqw = new LambdaQueryWrapper<>();
            siqw.eq(StyleInfo::getTenantId, tenantId)
                    .in(StyleInfo::getStyleNo, styleNos)
                    .eq(StyleInfo::getDeleteFlag, 0)
                    .select(StyleInfo::getId, StyleInfo::getStyleNo);
            List<StyleInfo> styleInfos = styleInfoMapper.selectList(siqw);
            for (StyleInfo s : styleInfos) {
                styleInfoByNo.put(s.getStyleNo(), s);
                if (s.getId() != null) styleNoById.put(s.getId(), s.getStyleNo());
            }
        }

        // Step 2: 批量取BOM → styleNo -> [bom1, bom2, ...]  [1 SQL]
        // StyleBom 无 styleNo 字段，按 styleId IN 查询；注意 StyleBom 没有 deleteFlag 字段
        Map<String, List<StyleBom>> bomByStyle = new HashMap<>();
        // 暂存所有 materialCode（StyleBom/materialStock/materialPurchase 三表对齐字段）
        Set<String> materialCodeSet = new HashSet<>();
        if (!styleNoById.isEmpty()) {
            List<Long> styleIds = new ArrayList<>(styleNoById.keySet());
            LambdaQueryWrapper<StyleBom> qw = new LambdaQueryWrapper<>();
            qw.eq(StyleBom::getTenantId, tenantId)
                    .in(StyleBom::getStyleId, styleIds);
            List<StyleBom> boms = styleBomMapper.selectList(qw);
            for (StyleBom b : boms) {
                String sno = styleNoById.get(b.getStyleId());
                if (sno == null) continue;
                bomByStyle.computeIfAbsent(sno, k -> new ArrayList<>()).add(b);
                if (StringUtils.hasText(b.getMaterialCode())) {
                    materialCodeSet.add(b.getMaterialCode());
                }
            }
        }
        List<String> materialCodes = new ArrayList<>(materialCodeSet);

        // Step 3: 批量库存 → materialCode(String) -> availableStock  [1 SQL，聚合]
        Map<String, Integer> stockByCode = new HashMap<>();
        if (!materialCodes.isEmpty()) {
            try {
                List<Map<String, Object>> rows = materialStockMapper.queryAvailableStockByMaterials(
                        tenantId, materialCodes);
                for (Map<String, Object> r : rows) {
                    Object mc = r.get("materialCode");
                    Object qty = r.get("availableStock");
                    if (mc != null && qty != null) {
                        stockByCode.put(String.valueOf(mc), ((Number) qty).intValue());
                    }
                }
            } catch (Exception ex) {
                log.warn("[SmartSourcing] queryAvailableStockByMaterials failed, fallback 0 stock", ex);
            }
        }

        // Step 4: 批量在途 → materialCode(String) -> inTransitQuantity [1 SQL，聚合]
        Map<String, BigDecimal> inTransitByCode = new HashMap<>();
        if (!materialCodes.isEmpty()) {
            try {
                List<Map<String, Object>> rows = materialPurchaseMapper.queryInTransitByMaterials(
                        tenantId, materialCodes);
                for (Map<String, Object> r : rows) {
                    Object mc = r.get("materialCode");
                    Object qty = r.get("inTransit");
                    if (mc != null && qty != null) {
                        inTransitByCode.put(String.valueOf(mc), new BigDecimal(qty.toString()));
                    }
                }
            } catch (Exception ex) {
                log.warn("[SmartSourcing] queryInTransitByMaterials failed, fallback 0 inTransit", ex);
            }
        }

        // Step 5~8：概览汇总（BOM指定供应商/历史价等概览层暂不加，详情页走原接口）
        Map<String, OrderOverviewDto> result = new LinkedHashMap<>();
        for (String orderNo : orderNos) {
            ProductionOrder o = orderMap.get(orderNo);
            if (o == null) continue;
            List<StyleBom> boms = bomByStyle.getOrDefault(o.getStyleNo(), Collections.emptyList());
            int bomCount = boms.size();
            int shortage = 0;
            int sufficient = 0;
            BigDecimal shortageAmt = BigDecimal.ZERO;
            BigDecimal totalBomAmt = BigDecimal.ZERO;
            List<String> criticalMaterials = new ArrayList<>();
            List<SourcingHint> hints = new ArrayList<>();

            int orderQty = o.getOrderQuantity() == null ? 0 : o.getOrderQuantity();

            for (StyleBom bom : boms) {
                if (!StringUtils.hasText(bom.getMaterialCode())) {
                    // BOM 行无编码的跳过（与 buildNetDemandDetails 逻辑保持一致）
                    continue;
                }
                BigDecimal usage = bom.getUsageAmount() == null ? BigDecimal.ZERO : bom.getUsageAmount();
                BigDecimal lossRate = bom.getLossRate() == null ? BigDecimal.ZERO : bom.getLossRate();
                BigDecimal factor = BigDecimal.ONE.add(lossRate.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                BigDecimal demand = usage.multiply(new BigDecimal(orderQty)).multiply(factor);
                BigDecimal unitPrice = bom.getUnitPrice() == null ? BigDecimal.ZERO : bom.getUnitPrice();

                String mc = bom.getMaterialCode();
                int stock = stockByCode.getOrDefault(mc, 0);
                BigDecimal inTransit = inTransitByCode.getOrDefault(mc, BigDecimal.ZERO);
                BigDecimal netDemand = demand.subtract(new BigDecimal(stock)).subtract(inTransit);
                if (netDemand.compareTo(BigDecimal.ZERO) < 0) netDemand = BigDecimal.ZERO;

                // BOM 行总金额（参考对比）
                BigDecimal bomLineAmt = usage.multiply(new BigDecimal(orderQty)).multiply(unitPrice);
                totalBomAmt = totalBomAmt.add(bomLineAmt);

                if (netDemand.compareTo(BigDecimal.ZERO) > 0) {
                    shortage++;
                    shortageAmt = shortageAmt.add(netDemand.multiply(unitPrice));
                    // 关键缺料：优先"面料/主面料"大类（materialType），TOP3
                    String mtype = bom.getMaterialType();
                    boolean isFabric = mtype != null && (mtype.contains("面料") || mtype.contains("主面料"));
                    boolean isImportant = isFabric ||
                            (bom.getMaterialName() != null &&
                                    (bom.getMaterialName().contains("面料") || bom.getMaterialName().contains("布")));
                    if (isImportant && criticalMaterials.size() < 3) {
                        criticalMaterials.add(bom.getMaterialName());
                    }
                } else {
                    sufficient++;
                }
            }

            // 关键路径一句话
            String criticalPath;
            if (bomCount == 0) {
                criticalPath = "该订单无BOM，请先维护物料清单";
                hints.add(SourcingHint.builder().type("warn").message("该款未维护BOM，无法计算净需求").build());
            } else if (shortage == 0) {
                criticalPath = "物料全部充足（" + sufficient + "种）";
                hints.add(SourcingHint.builder().type("success").message("库存+在途≥需求，无需采购").build());
            } else {
                int finalOrderQty = orderQty;
                Map<String, Integer> stockByCodeFinal = stockByCode;
                Map<String, BigDecimal> inTransitByCodeFinal = inTransitByCode;
                int fabricShort = (int) boms.stream().filter(b -> {
                    if (!StringUtils.hasText(b.getMaterialCode())) return false;
                    BigDecimal d = (b.getUsageAmount() == null ? BigDecimal.ZERO : b.getUsageAmount())
                            .multiply(new BigDecimal(finalOrderQty))
                            .multiply(BigDecimal.ONE.add((b.getLossRate() == null ? BigDecimal.ZERO : b.getLossRate())
                                    .divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP)));
                    String mc = b.getMaterialCode();
                    int stk = stockByCodeFinal.getOrDefault(mc, 0);
                    BigDecimal it = inTransitByCodeFinal.getOrDefault(mc, BigDecimal.ZERO);
                    BigDecimal net = d.subtract(new BigDecimal(stk)).subtract(it);
                    if (net.compareTo(BigDecimal.ZERO) <= 0) return false;
                    String mt = b.getMaterialType();
                    return (mt != null && (mt.contains("面料") || mt.contains("主面料"))) ||
                            (b.getMaterialName() != null && b.getMaterialName().contains("面料"));
                }).count();
                int accShort = shortage - fabricShort;
                if (fabricShort > 0) {
                    criticalPath = String.format("面料缺%d种，辅料缺%d种（无法开裁）", fabricShort, accShort);
                    hints.add(SourcingHint.builder().type("risk").message(criticalPath).build());
                } else {
                    criticalPath = String.format("辅料缺%d种（面料已齐，可排期裁剪）", accShort);
                    hints.add(SourcingHint.builder().type("warn").message(criticalPath).build());
                }
            }

            if (bomCount > 0 && shortage > 0) {
                String hint = String.format("预计采购金额约 ¥%,.2f（按 BOM 单价预估）", shortageAmt);
                hints.add(SourcingHint.builder().type("info").message(hint).build());
            }

            result.put(orderNo, OrderOverviewDto.builder()
                    .orderNo(orderNo)
                    .bomItemsCount(bomCount)
                    .shortageCount(shortage)
                    .sufficientCount(sufficient)
                    .shortageAmount(shortageAmt.setScale(2, RoundingMode.HALF_UP))
                    .totalBomAmount(totalBomAmt.setScale(2, RoundingMode.HALF_UP))
                    .criticalMaterials(criticalMaterials)
                    .criticalPath(criticalPath)
                    .hints(hints)
                    .computedAt(computedAt)
                    .fromCache(false)
                    .build());
        }
        return result;
    }

    /**
     * 从明细反推 overview（用于详情页刷新后同步缓存）
     */
    private OrderOverviewDto buildOverviewFromDetail(String orderNo,
                                                     List<Map<String, Object>> detail,
                                                     LocalDateTime computedAt) {
        int bomCount = detail.size();
        int shortage = 0;
        int sufficient = 0;
        BigDecimal shortageAmt = BigDecimal.ZERO;
        BigDecimal totalBomAmt = BigDecimal.ZERO;
        List<String> critical = new ArrayList<>();
        List<SourcingHint> hints = new ArrayList<>();

        for (Map<String, Object> d : detail) {
            BigDecimal demand = toDecimal(d.get("demand"));
            BigDecimal unitPrice = toDecimal(d.get("bomUnitPrice"));
            if (unitPrice == null) unitPrice = BigDecimal.ZERO;
            BigDecimal net = toDecimal(d.get("netDemand"));
            totalBomAmt = totalBomAmt.add(demand.multiply(unitPrice));
            if (net != null && net.compareTo(BigDecimal.ZERO) > 0) {
                shortage++;
                shortageAmt = shortageAmt.add(net.multiply(unitPrice));
                String name = d.get("materialName") == null ? null : d.get("materialName").toString();
                if (name != null && critical.size() < 3
                        && (name.contains("面料") || name.contains("布"))) {
                    critical.add(name);
                }
            } else {
                sufficient++;
            }
        }
        String path;
        if (bomCount == 0) path = "该订单无BOM，请先维护物料清单";
        else if (shortage == 0) path = "物料全部充足（" + sufficient + "种）";
        else path = String.format("共缺料%d种（%d种充足）", shortage, sufficient);
        if (shortage > 0) {
            hints.add(SourcingHint.builder().type("info")
                    .message(String.format("预计采购金额约 ¥%,.2f（按 BOM 单价预估）", shortageAmt)).build());
        } else if (bomCount > 0) {
            hints.add(SourcingHint.builder().type("success").message("库存+在途≥需求，无需采购").build());
        }
        return OrderOverviewDto.builder()
                .orderNo(orderNo)
                .bomItemsCount(bomCount)
                .shortageCount(shortage)
                .sufficientCount(sufficient)
                .shortageAmount(shortageAmt.setScale(2, RoundingMode.HALF_UP))
                .totalBomAmount(totalBomAmt.setScale(2, RoundingMode.HALF_UP))
                .criticalMaterials(critical)
                .criticalPath(path)
                .hints(hints)
                .computedAt(computedAt)
                .fromCache(false)
                .build();
    }

    private static BigDecimal toDecimal(Object v) {
        if (v == null) return BigDecimal.ZERO;
        if (v instanceof BigDecimal) return (BigDecimal) v;
        try { return new BigDecimal(v.toString()); } catch (Exception e) { return BigDecimal.ZERO; }
    }
}
