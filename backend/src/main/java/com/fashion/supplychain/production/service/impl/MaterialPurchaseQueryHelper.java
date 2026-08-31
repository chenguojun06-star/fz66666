package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.helper.MaterialPurchaseHelper;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Component("materialPurchaseQueryHelperImpl")
@Slf4j
class MaterialPurchaseQueryHelper {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    @Autowired
    private MaterialPurchaseServiceHelper serviceHelper;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleAttachmentService styleAttachmentService;

    LambdaQueryWrapper<MaterialPurchase> buildQueryWrapper(Map<String, Object> safeParams, Long tenantId) {
        String purchaseNo = (String) safeParams.getOrDefault("purchaseNo", "");
        String materialCode = (String) safeParams.getOrDefault("materialCode", "");
        String materialName = (String) safeParams.getOrDefault("materialName", "");
        String supplierName = (String) safeParams.getOrDefault("supplierName", "");
        String supplier = (String) safeParams.getOrDefault("supplier", "");
        String status = (String) safeParams.getOrDefault("status", "");
        String orderNo = (String) safeParams.getOrDefault("orderNo", "");
        String styleNo = (String) safeParams.getOrDefault("styleNo", "");
        String styleId = (String) safeParams.getOrDefault("styleId", "");
        String materialType = (String) safeParams.getOrDefault("materialType", "");
        String sourceType = (String) safeParams.getOrDefault("sourceType", "");
        String factoryType = (String) safeParams.getOrDefault("factoryType", "");
        String factoryName = (String) safeParams.getOrDefault("factoryName", "");
        String receiverId = (String) safeParams.getOrDefault("receiverId", "");
        String receiverName = (String) safeParams.getOrDefault("receiverName", "");
        String patternProductionId = (String) safeParams.getOrDefault("patternProductionId", "");

        LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(MaterialPurchase::getTenantId, tenantId);

        applyKeywordSearch(wrapper, orderNo, tenantId);
        applyBasicFilters(wrapper, purchaseNo, materialCode, materialName, styleNo, status, receiverId, receiverName, orderNo);
        applySourceTypeFilter(wrapper, sourceType);
        applyMaterialTypeFilter(wrapper, materialType);
        applySupplierFilter(wrapper, supplierName, supplier);
        applyPatternProductionIdFilter(wrapper, patternProductionId);
        applyStyleIdFilter(wrapper, styleId);
        excludeScrappedOrders(wrapper, tenantId, orderNo);
        applyFactoryFilters(wrapper, tenantId, factoryType, factoryName);
        applyFactoryOrderIds(wrapper, safeParams);

        return wrapper;
    }

    void repairRecords(List<MaterialPurchase> records) {
        for (MaterialPurchase record : records) {
            if (record == null || !StringUtils.hasText(record.getId())) continue;
            serviceHelper.ensureSnapshot(record);
            if (record.getReturnConfirmed() != null && record.getReturnConfirmed() == 1) {
                Integer beforeArrivedQuantity = record.getArrivedQuantity();
                int arrived = beforeArrivedQuantity == null ? 0 : beforeArrivedQuantity;
                int rq = record.getReturnQuantity() == null ? 0 : record.getReturnQuantity().intValue();
                if (arrived != rq) {
                    record.setArrivedQuantity(rq);
                    if (record.getUnitPrice() != null) record.setTotalAmount(record.getUnitPrice().multiply(BigDecimal.valueOf(rq)));
                    int pq = record.getPurchaseQuantity() == null ? 0 : record.getPurchaseQuantity().intValue();
                    String s = record.getStatus() == null ? "" : record.getStatus().trim();
                    record.setStatus(MaterialPurchaseHelper.resolveStatusByArrived(s, rq, pq));
                }
            }
            MaterialPurchaseHelper.repairReceiverFromRemark(record);
        }
    }

    void enrichFactoryInfo(List<MaterialPurchase> records) {
        List<String> orderIds = records.stream()
                .map(MaterialPurchase::getOrderId).filter(StringUtils::hasText).distinct().collect(Collectors.toList());
        if (orderIds.isEmpty()) return;
        Map<String, ProductionOrder> factoryOrderMap = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .in(ProductionOrder::getId, orderIds)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .select(ProductionOrder::getId, ProductionOrder::getFactoryName, ProductionOrder::getFactoryType))
                .stream().filter(o -> o != null && StringUtils.hasText(o.getId()))
                .collect(Collectors.toMap(ProductionOrder::getId, o -> o, (a, b) -> a));
        for (MaterialPurchase record : records) {
            String oid = record.getOrderId();
            if (StringUtils.hasText(oid) && factoryOrderMap.containsKey(oid.trim())) {
                ProductionOrder order = factoryOrderMap.get(oid.trim());
                record.setFactoryName(order.getFactoryName());
                record.setFactoryType(order.getFactoryType());
            }
        }
    }

    void enrichFromMaterialDatabase(List<MaterialPurchase> records) {
        List<String> matCodes = records.stream()
                .map(MaterialPurchase::getMaterialCode).filter(StringUtils::hasText).distinct().collect(Collectors.toList());
        if (matCodes.isEmpty()) return;
        Map<String, MaterialDatabase> dbMap = materialDatabaseService.list(
                new LambdaQueryWrapper<MaterialDatabase>()
                        .in(MaterialDatabase::getMaterialCode, matCodes)
                        .select(MaterialDatabase::getId, MaterialDatabase::getMaterialCode,
                                MaterialDatabase::getFabricWidth, MaterialDatabase::getFabricWeight,
                                MaterialDatabase::getFabricComposition, MaterialDatabase::getSupplierName,
                                MaterialDatabase::getUnitPrice, MaterialDatabase::getColor, MaterialDatabase::getSpecifications))
                .stream().filter(d -> d != null && StringUtils.hasText(d.getMaterialCode()))
                .collect(Collectors.toMap(MaterialDatabase::getMaterialCode, d -> d, (a, b) -> a));
        for (MaterialPurchase record : records) {
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
        // D-256：资料库也缺属性时，从款式 BOM 兜底（存量采购记录显示自愈）
        enrichMissingFromBom(records);
    }

    /**
     * D-256：资料库仍缺属性时，从款式 BOM 兜底回填（存量采购记录显示自愈）。
     * 背景：存量 t_material_database / t_material_purchase 的成分/克重/幅宽/颜色
     * 绝大多数为空（实测 219 条采购中成分空 212 条），而所有显示链路都依赖
     * 查询时回填 → 资料库无数据则永远空。BOM 里这些字段相对完整，按以下口径兜底：
     * - 成分/克重/规格：物料固有属性，按 materialCode 任取非空值，跨款安全
     * - 颜色/尺码：与款式绑定，仅当同款同编码 (styleId, materialCode) 的 BOM
     *   非空值去重后唯一时才补，避免多色/多码 BOM 行错配
     * fail-safe：任何异常只 log.warn，绝不影响主查询
     */
    private void enrichMissingFromBom(List<MaterialPurchase> records) {
        try {
            Set<String> codes = new LinkedHashSet<>();
            for (MaterialPurchase r : records) {
                if (r == null || !StringUtils.hasText(r.getMaterialCode())) continue;
                boolean missingIntrinsic = !StringUtils.hasText(r.getFabricComposition())
                        || !StringUtils.hasText(r.getFabricWeight())
                        || !StringUtils.hasText(r.getSpecifications());
                boolean missingStyleBound = (!StringUtils.hasText(r.getColor()) || !StringUtils.hasText(r.getSize()))
                        && StringUtils.hasText(r.getStyleId());
                if (missingIntrinsic || missingStyleBound) codes.add(r.getMaterialCode().trim());
            }
            if (codes.isEmpty()) return;
            List<StyleBom> bomList = styleBomService.list(new LambdaQueryWrapper<StyleBom>()
                    .in(StyleBom::getMaterialCode, codes)
                    .select(StyleBom::getMaterialCode, StyleBom::getStyleId, StyleBom::getFabricComposition,
                            StyleBom::getFabricWeight, StyleBom::getSpecification, StyleBom::getColor, StyleBom::getSize));
            if (bomList == null || bomList.isEmpty()) return;

            // 物料固有属性：按编码取首个非空
            Map<String, StyleBom> intrinsicByCode = new HashMap<>();
            // 款式绑定属性：key = styleId|code，值集合去重（唯一才敢补）
            Map<String, Set<String>> colorsByStyleCode = new HashMap<>();
            Map<String, Set<String>> sizesByStyleCode = new HashMap<>();
            for (StyleBom b : bomList) {
                if (b == null || !StringUtils.hasText(b.getMaterialCode())) continue;
                String code = b.getMaterialCode().trim();
                intrinsicByCode.putIfAbsent(code, b);
                String sid = b.getStyleId() == null ? "" : String.valueOf(b.getStyleId()).trim();
                String sk = sid + "|" + code;
                if (StringUtils.hasText(b.getColor())) {
                    colorsByStyleCode.computeIfAbsent(sk, k -> new HashSet<>()).add(b.getColor().trim());
                }
                if (StringUtils.hasText(b.getSize())) {
                    sizesByStyleCode.computeIfAbsent(sk, k -> new HashSet<>()).add(b.getSize().trim());
                }
            }
            for (MaterialPurchase r : records) {
                if (r == null || !StringUtils.hasText(r.getMaterialCode())) continue;
                String code = r.getMaterialCode().trim();
                if (!StringUtils.hasText(r.getFabricComposition()) || !StringUtils.hasText(r.getFabricWeight())
                        || !StringUtils.hasText(r.getSpecifications())) {
                    StyleBom b = intrinsicByCode.get(code);
                    if (b != null) {
                        if (!StringUtils.hasText(r.getFabricComposition()) && StringUtils.hasText(b.getFabricComposition())) {
                            r.setFabricComposition(b.getFabricComposition());
                        }
                        if (!StringUtils.hasText(r.getFabricWeight()) && StringUtils.hasText(b.getFabricWeight())) {
                            r.setFabricWeight(b.getFabricWeight());
                        }
                        if (!StringUtils.hasText(r.getSpecifications()) && StringUtils.hasText(b.getSpecification())) {
                            r.setSpecifications(b.getSpecification());
                        }
                    }
                }
                if (!StringUtils.hasText(r.getColor()) || !StringUtils.hasText(r.getSize())) {
                    String sid = StringUtils.hasText(r.getStyleId()) ? r.getStyleId().trim() : "";
                    String sk = sid + "|" + code;
                    Set<String> colors = colorsByStyleCode.get(sk);
                    if (!StringUtils.hasText(r.getColor()) && colors != null && colors.size() == 1) {
                        r.setColor(colors.iterator().next());
                    }
                    Set<String> sizes = sizesByStyleCode.get(sk);
                    if (!StringUtils.hasText(r.getSize()) && sizes != null && sizes.size() == 1) {
                        r.setSize(sizes.iterator().next());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("从款式BOM兜底回填采购属性失败(不影响主查询): {}", e.getMessage());
        }
    }

    /**
     * 补齐 styleName/styleCover：从 StyleInfo 查询补齐
     * - styleName 为空时，从 StyleInfo.styleName 补齐
     * - styleCover 为空时，从 StyleInfo.cover 补齐，并加 StyleAttachment 兜底
     */
    void enrichStyleInfo(List<MaterialPurchase> records) {
        if (records == null || records.isEmpty()) return;
        // 收集需要补齐 styleName 或 styleCover 的 styleId
        List<String> styleIds = records.stream()
                .map(MaterialPurchase::getStyleId)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
        if (styleIds.isEmpty()) return;

        // 批量查询所有 StyleInfo（避免 N+1：原循环内 getById 改为 listByIds 批量查询）
        Map<String, StyleInfo> styleByIdStr = new HashMap<>();
        List<Long> validLongIds = new ArrayList<>();
        Map<Long, String> longIdToStrId = new HashMap<>();
        for (String sid : styleIds) {
            try {
                Long lid = Long.parseLong(sid);
                validLongIds.add(lid);
                longIdToStrId.put(lid, sid);
            } catch (NumberFormatException ignore) {
                // styleId 非数字，跳过
            }
        }
        if (!validLongIds.isEmpty()) {
            for (StyleInfo info : styleInfoService.listByIds(validLongIds)) {
                String sid = longIdToStrId.get(info.getId());
                if (sid != null) styleByIdStr.put(sid, info);
            }
        }
        if (styleByIdStr.isEmpty()) return;

        // 收集需要走二级兜底的 styleId（StyleInfo.cover 为空）
        List<String> missingCoverStyleIds = styleByIdStr.entrySet().stream()
                .filter(e -> !StringUtils.hasText(e.getValue().getCover()))
                .map(Map.Entry::getKey)
                .collect(Collectors.toList());

        // 二级兜底：StyleAttachment 查图片附件
        Map<String, String> attachCoverByStyleId = new HashMap<>();
        if (!missingCoverStyleIds.isEmpty()) {
            try {
                List<StyleAttachment> attachments = styleAttachmentService.list(
                        new LambdaQueryWrapper<StyleAttachment>()
                                .in(StyleAttachment::getStyleId, missingCoverStyleIds)
                                .like(StyleAttachment::getFileType, "image")
                                .eq(StyleAttachment::getStatus, "active")
                                .orderByAsc(StyleAttachment::getCreateTime));
                if (attachments != null) {
                    for (StyleAttachment a : attachments) {
                        if (a == null || !StringUtils.hasText(a.getFileUrl()) || !StringUtils.hasText(a.getStyleId())) continue;
                        attachCoverByStyleId.putIfAbsent(a.getStyleId().trim(), a.getFileUrl());
                    }
                }
            } catch (Exception e) {
                log.warn("从 StyleAttachment 查封面图失败: styleIds={}", missingCoverStyleIds, e);
            }
        }

        for (MaterialPurchase record : records) {
            String sid = record.getStyleId();
            if (!StringUtils.hasText(sid)) continue;
            StyleInfo info = styleByIdStr.get(sid.trim());
            if (info == null) continue;
            // 补齐 styleName
            if (!StringUtils.hasText(record.getStyleName()) && StringUtils.hasText(info.getStyleName())) {
                record.setStyleName(info.getStyleName());
            }
            // 补齐 styleCover：一级 StyleInfo.cover → 二级 StyleAttachment
            if (!StringUtils.hasText(record.getStyleCover())) {
                if (StringUtils.hasText(info.getCover())) {
                    record.setStyleCover(info.getCover());
                } else {
                    String attachCover = attachCoverByStyleId.get(sid.trim());
                    if (StringUtils.hasText(attachCover)) {
                        record.setStyleCover(attachCover);
                    }
                }
            }
        }
    }

    private void applyKeywordSearch(LambdaQueryWrapper<MaterialPurchase> wrapper, String orderNo, Long tenantId) {
        if (!StringUtils.hasText(orderNo)) return;
        String keyword = orderNo.trim();
        List<String> matchedOrderIds = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                    .select(ProductionOrder::getId)
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .and(w -> w.like(ProductionOrder::getFactoryName, keyword)
                        .or().like(ProductionOrder::getOrderNo, keyword)
                        .or().like(ProductionOrder::getStyleNo, keyword))
                    .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                    .ne(ProductionOrder::getStatus, "scrapped"))
                .stream().map(ProductionOrder::getId).filter(StringUtils::hasText).collect(Collectors.toList());

        wrapper.and(w -> {
            w.like(MaterialPurchase::getOrderNo, keyword)
                    .or().like(MaterialPurchase::getPurchaseNo, keyword)
                    .or().like(MaterialPurchase::getMaterialCode, keyword)
                    .or().like(MaterialPurchase::getMaterialName, keyword)
                    .or().like(MaterialPurchase::getSupplierName, keyword);
            if (!matchedOrderIds.isEmpty()) w.or().in(MaterialPurchase::getOrderId, matchedOrderIds);
        });
    }

    private void applyBasicFilters(LambdaQueryWrapper<MaterialPurchase> wrapper,
            String purchaseNo, String materialCode, String materialName, String styleNo,
            String status, String receiverId, String receiverName, String orderNo) {
        wrapper.like(StringUtils.hasText(purchaseNo), MaterialPurchase::getPurchaseNo, purchaseNo)
                .like(StringUtils.hasText(materialCode), MaterialPurchase::getMaterialCode, materialCode)
                .like(StringUtils.hasText(materialName), MaterialPurchase::getMaterialName, materialName)
                .like(StringUtils.hasText(styleNo), MaterialPurchase::getStyleNo, styleNo)
                .eq(StringUtils.hasText(receiverId), MaterialPurchase::getReceiverId, receiverId)
                .like(StringUtils.hasText(receiverName), MaterialPurchase::getReceiverName, receiverName)
                .and(StringUtils.hasText(status), w -> {
                    // 状态分组必须与 MaterialPurchaseQueryHelper.computeStatusStats 保持一致
                    // 任何新增状态必须同时更新此处和 computeStatusStats，否则会出现"统计数≠列表数"的 P0 bug
                    if ("pending".equals(status)) {
                        w.eq(MaterialPurchase::getStatus, "pending");
                    } else if ("received".equals(status)) {
                        // 已采购：received + warehouse_pending（待仓库出库）
                        w.in(MaterialPurchase::getStatus, "received", "warehouse_pending");
                    } else if ("partial".equals(status)) {
                        // 部分到货：partial + partial_arrival
                        w.in(MaterialPurchase::getStatus, "partial", "partial_arrival");
                    } else if ("completed".equals(status)) {
                        // 全部到货：completed + awaiting_confirm（待确认完成）
                        w.in(MaterialPurchase::getStatus, "completed", "awaiting_confirm");
                    } else {
                        w.eq(MaterialPurchase::getStatus, status);
                    }
                })
                .orderByDesc(MaterialPurchase::getCreateTime);
    }

    private void applySourceTypeFilter(LambdaQueryWrapper<MaterialPurchase> wrapper, String sourceType) {
        if (!StringUtils.hasText(sourceType)) return;
        if ("batch".equals(sourceType)) wrapper.in(MaterialPurchase::getSourceType, "batch", "stock", "manual");
        else wrapper.eq(MaterialPurchase::getSourceType, sourceType);
    }

    private void applyMaterialTypeFilter(LambdaQueryWrapper<MaterialPurchase> wrapper, String materialType) {
        if (!StringUtils.hasText(materialType)) return;
        String mt = materialType.trim();
        if (MaterialConstants.TYPE_FABRIC.equals(mt) || MaterialConstants.TYPE_LINING.equals(mt) || MaterialConstants.TYPE_ACCESSORY.equals(mt)) {
            wrapper.and(w -> {
                w.likeRight(MaterialPurchase::getMaterialType, mt);
                if (MaterialConstants.TYPE_FABRIC.equals(mt)) w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_FABRIC_CN);
                else if (MaterialConstants.TYPE_LINING.equals(mt)) w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_LINING_CN);
                else if (MaterialConstants.TYPE_ACCESSORY.equals(mt)) w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_ACCESSORY_CN);
            });
        } else {
            wrapper.eq(MaterialPurchase::getMaterialType, mt);
        }
    }

    private void applySupplierFilter(LambdaQueryWrapper<MaterialPurchase> wrapper, String supplierName, String supplier) {
        if (StringUtils.hasText(supplierName)) wrapper.like(MaterialPurchase::getSupplierName, supplierName);
        else if (StringUtils.hasText(supplier)) wrapper.like(MaterialPurchase::getSupplierName, supplier);
    }

    private void applyPatternProductionIdFilter(LambdaQueryWrapper<MaterialPurchase> wrapper, String patternProductionId) {
        if (!StringUtils.hasText(patternProductionId)) return;
        wrapper.eq(MaterialPurchase::getPatternProductionId, patternProductionId.trim());
    }

    private void applyStyleIdFilter(LambdaQueryWrapper<MaterialPurchase> wrapper, String styleId) {
        if (!StringUtils.hasText(styleId)) return;
        wrapper.eq(MaterialPurchase::getStyleId, styleId.trim());
    }

    private void excludeScrappedOrders(LambdaQueryWrapper<MaterialPurchase> wrapper, Long tenantId, String orderNo) {
        // 指定了订单号（订单面辅料详情页）时不过滤，已完成/已关闭等订单也必须能看到自己的采购记录
        if (StringUtils.hasText(orderNo)) return;
        // 排除已删除 + 已关闭/已取消/已归档/已报废 的订单关联采购记录（已完成订单的采购记录需保留展示）
        List<String> invalidOrderIds = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .and(w -> w.eq(ProductionOrder::getDeleteFlag, 1)
                                .or().in(ProductionOrder::getStatus, "scrapped", "closed", "cancelled", "archived")))
                .stream().map(ProductionOrder::getId).filter(StringUtils::hasText).collect(Collectors.toList());
        if (!invalidOrderIds.isEmpty()) {
            wrapper.and(w -> w.isNull(MaterialPurchase::getOrderId).or().eq(MaterialPurchase::getOrderId, "").or().notIn(MaterialPurchase::getOrderId, invalidOrderIds));
        }
    }

    private void applyFactoryFilters(LambdaQueryWrapper<MaterialPurchase> wrapper, Long tenantId, String factoryType, String factoryName) {
        if (StringUtils.hasText(factoryType)) {
            List<String> ftOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId).eq(ProductionOrder::getTenantId, tenantId)
                            .eq(ProductionOrder::getFactoryType, factoryType.trim().toUpperCase())
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                            .notIn(ProductionOrder::getStatus, "scrapped", "closed", "cancelled", "archived"))
                    .stream().map(ProductionOrder::getId).filter(StringUtils::hasText).collect(Collectors.toList());
            wrapper.and(w -> { w.isNull(MaterialPurchase::getOrderId).or().eq(MaterialPurchase::getOrderId, ""); if (!ftOrderIds.isEmpty()) w.or().in(MaterialPurchase::getOrderId, ftOrderIds); });
        }
        if (StringUtils.hasText(factoryName)) {
            List<String> fnOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId).eq(ProductionOrder::getTenantId, tenantId)
                            .like(ProductionOrder::getFactoryName, factoryName.trim())
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                            .notIn(ProductionOrder::getStatus, "scrapped", "closed", "cancelled", "archived"))
                    .stream().map(ProductionOrder::getId).filter(StringUtils::hasText).collect(Collectors.toList());
            wrapper.and(w -> { w.isNull(MaterialPurchase::getOrderId).or().eq(MaterialPurchase::getOrderId, ""); if (!fnOrderIds.isEmpty()) w.or().in(MaterialPurchase::getOrderId, fnOrderIds); });
        }
    }

    @SuppressWarnings("unchecked")
    private void applyFactoryOrderIds(LambdaQueryWrapper<MaterialPurchase> wrapper, Map<String, Object> safeParams) {
        List<String> factoryOrderIds = (List<String>) safeParams.get("_factoryOrderIds");
        if (factoryOrderIds != null && !factoryOrderIds.isEmpty()) wrapper.in(MaterialPurchase::getOrderId, factoryOrderIds);
    }
}
