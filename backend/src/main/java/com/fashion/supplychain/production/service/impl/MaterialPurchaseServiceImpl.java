package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.common.ParamUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Set;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.util.StringUtils;
import java.util.NoSuchElementException;
import java.time.format.DateTimeFormatter;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class MaterialPurchaseServiceImpl extends ServiceImpl<MaterialPurchaseMapper, MaterialPurchase>
        implements MaterialPurchaseService {

    private static final Pattern RECEIVER_REMARK_TIME = Pattern
            .compile("(\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}(?::\\d{2})?)");

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleAttachmentService styleAttachmentService;

    @Autowired
    private ObjectMapper objectMapper;

    private static class OrderLine {
        public String color;
        public String size;
        public Integer quantity;
    }

    @Override
    public String resolveMaterialId(MaterialPurchase purchase) {
        if (purchase == null) {
            return null;
        }
        String existing = purchase.getMaterialId();
        if (StringUtils.hasText(existing)) {
            return existing.trim();
        }

        String styleId = StringUtils.hasText(purchase.getStyleId()) ? purchase.getStyleId().trim() : "";
        String type = StringUtils.hasText(purchase.getMaterialType()) ? purchase.getMaterialType().trim().toLowerCase()
                : "";
        String code = StringUtils.hasText(purchase.getMaterialCode()) ? purchase.getMaterialCode().trim() : "";
        String name = StringUtils.hasText(purchase.getMaterialName()) ? purchase.getMaterialName().trim() : "";
        String spec = StringUtils.hasText(purchase.getSpecifications()) ? purchase.getSpecifications().trim() : "";
        String unit = StringUtils.hasText(purchase.getUnit()) ? purchase.getUnit().trim() : "";

        String key = String.join("|", styleId, type, code, name, spec, unit);
        if (!StringUtils.hasText(key.replace("|", "").trim())) {
            return null;
        }
        return UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)).toString();
    }

    private String normalizeMatchKey(String v) {
        return v == null ? "" : v.trim().replaceAll("\\s+", " ").toLowerCase();
    }

    private List<String> splitOptions(String value) {
        if (!StringUtils.hasText(value)) {
            return List.of();
        }
        String[] parts = value.split("[,/，、\\s]+");
        List<String> out = new ArrayList<>();
        for (String p : parts) {
            String n = normalizeMatchKey(p);
            if (StringUtils.hasText(n)) {
                out.add(n);
            }
        }
        return out;
    }

    private String normalizeMaterialType(String raw) {
        String type = raw == null ? "" : raw.trim();
        if (!StringUtils.hasText(type)) {
            return "fabric";
        }

        if ("面料".equals(type))
            return "fabric";
        if ("里料".equals(type))
            return "lining";
        if ("辅料".equals(type))
            return "accessory";

        if (type.startsWith("面料") && type.length() > 2) {
            return "fabric" + type.substring(2).trim();
        }
        if (type.startsWith("里料") && type.length() > 2) {
            return "lining" + type.substring(2).trim();
        }
        if (type.startsWith("辅料") && type.length() > 2) {
            return "accessory" + type.substring(2).trim();
        }

        return type;
    }

    private Set<String> intersectOrNull(Set<String> source, Set<String> allowed) {
        if (source == null) {
            return null;
        }
        if (allowed == null || allowed.isEmpty()) {
            return null;
        }
        Set<String> next = new HashSet<>();
        for (String v : source) {
            if (allowed.contains(v)) {
                next.add(v);
            }
        }
        return next.isEmpty() ? null : next;
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
        String materialType = (String) safeParams.getOrDefault("materialType", "");

        Page<MaterialPurchase> pageInfo = new Page<>(page, pageSize);
        LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .like(StringUtils.hasText(purchaseNo), MaterialPurchase::getPurchaseNo, purchaseNo)
                .like(StringUtils.hasText(materialCode), MaterialPurchase::getMaterialCode, materialCode)
                .like(StringUtils.hasText(materialName), MaterialPurchase::getMaterialName, materialName)
                .like(StringUtils.hasText(orderNo), MaterialPurchase::getOrderNo, orderNo)
                .eq(StringUtils.hasText(status), MaterialPurchase::getStatus, status)
                .orderByDesc(MaterialPurchase::getCreateTime);

        if (StringUtils.hasText(materialType)) {
            String mt = materialType.trim();
            if ("fabric".equals(mt) || "lining".equals(mt) || "accessory".equals(mt)) {
                wrapper.and(w -> {
                    w.likeRight(MaterialPurchase::getMaterialType, mt);
                    if ("fabric".equals(mt)) {
                        w.or().likeRight(MaterialPurchase::getMaterialType, "面料");
                    } else if ("lining".equals(mt)) {
                        w.or().likeRight(MaterialPurchase::getMaterialType, "里料");
                    } else if ("accessory".equals(mt)) {
                        w.or().likeRight(MaterialPurchase::getMaterialType, "辅料");
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

        IPage<MaterialPurchase> pageResult = baseMapper.selectPage(pageInfo, wrapper);

        List<MaterialPurchase> records = pageResult == null ? null : pageResult.getRecords();
        if (records != null && !records.isEmpty()) {
            for (MaterialPurchase record : records) {
                if (record == null || !StringUtils.hasText(record.getId())) {
                    continue;
                }
                String beforeStatus = record.getStatus();

                ensureSnapshot(record);

                if (record.getReturnConfirmed() != null && record.getReturnConfirmed() == 1) {
                    Integer beforeArrivedQuantity = record.getArrivedQuantity();
                    int arrived = beforeArrivedQuantity == null ? 0 : beforeArrivedQuantity;
                    int rq = record.getReturnQuantity() == null ? 0 : record.getReturnQuantity();
                    if (arrived != rq) {
                        record.setArrivedQuantity(rq);

                        if (record.getUnitPrice() != null) {
                            record.setTotalAmount(record.getUnitPrice().multiply(BigDecimal.valueOf(rq)));
                        }

                        int pq = record.getPurchaseQuantity() == null ? 0 : record.getPurchaseQuantity();
                        String s = beforeStatus == null ? "" : beforeStatus.trim();
                        record.setStatus(resolveStatusByArrived(s, rq, pq));
                    }
                }

                repairReceiverFromRemark(record);

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

    private boolean repairReceiverFromRemark(MaterialPurchase record) {
        if (record == null) {
            return false;
        }
        boolean needName = !StringUtils.hasText(record.getReceiverName());
        boolean needTime = record.getReceivedTime() == null;
        if (!needName && !needTime) {
            return false;
        }

        String remark = record.getRemark();
        if (!StringUtils.hasText(remark)) {
            return false;
        }

        String[] parts = remark.split("[；;]");
        for (String p : parts) {
            if (!StringUtils.hasText(p)) {
                continue;
            }
            String t = p.trim();
            if (!(t.startsWith("领取人") || t.startsWith("收货人") || t.startsWith("领料人"))) {
                continue;
            }

            int idx = t.indexOf('：');
            if (idx < 0) {
                idx = t.indexOf(':');
            }
            if (idx < 0 || idx >= t.length() - 1) {
                continue;
            }
            String payload = t.substring(idx + 1).trim();
            if (!StringUtils.hasText(payload)) {
                continue;
            }

            Matcher m = RECEIVER_REMARK_TIME.matcher(payload);
            String name = null;
            String timeRaw = null;
            if (m.find()) {
                timeRaw = m.group(1);
                String before = payload.substring(0, m.start()).trim();
                if (StringUtils.hasText(before)) {
                    name = before;
                }
            } else {
                String[] tokens = payload.split("\\s+");
                if (tokens.length > 0 && StringUtils.hasText(tokens[0])) {
                    name = tokens[0].trim();
                }
            }

            LocalDateTime time = tryParseRemarkTime(timeRaw);
            boolean changed = false;
            String nameTrimmed = name == null ? null : name.trim();
            if (needName && StringUtils.hasText(nameTrimmed)) {
                record.setReceiverName(nameTrimmed);
                changed = true;
                needName = false;
            }
            if (needTime && time != null) {
                record.setReceivedTime(time);
                changed = true;
                needTime = false;
            }
            if (changed) {
                return true;
            }
        }
        return false;
    }

    private LocalDateTime tryParseRemarkTime(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String s = raw.trim();
        try {
            if (s.length() >= 19) {
                return LocalDateTime.parse(s.substring(0, 19), DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            }
        } catch (Exception e) {
            log.warn("Failed to parse remark time with seconds: raw={}", raw, e);
        }
        try {
            if (s.length() >= 16) {
                return LocalDateTime.parse(s.substring(0, 16), DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
            }
        } catch (Exception e) {
            log.warn("Failed to parse remark time with minutes: raw={}", raw, e);
        }
        return null;
    }

    @Override
    public boolean deleteById(String id) {
        MaterialPurchase materialPurchase = new MaterialPurchase();
        materialPurchase.setId(id);
        materialPurchase.setDeleteFlag(1);
        materialPurchase.setUpdateTime(LocalDateTime.now());
        return this.updateById(materialPurchase);
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
            materialPurchase.setPurchaseNo(nextPurchaseNo());
        }

        if (!StringUtils.hasText(materialPurchase.getStatus())) {
            materialPurchase.setStatus("pending");
        }

        if (materialPurchase.getUnitPrice() == null) {
            materialPurchase.setUnitPrice(BigDecimal.ZERO);
        }

        int arrived = materialPurchase.getArrivedQuantity() == null ? 0 : materialPurchase.getArrivedQuantity();
        materialPurchase.setTotalAmount(materialPurchase.getUnitPrice().multiply(BigDecimal.valueOf(arrived)));

        ensureSnapshot(materialPurchase);

        // 保存物料采购记录
        return this.save(materialPurchase);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updatePurchaseAndUpdateOrder(MaterialPurchase materialPurchase) {
        // 设置更新时间
        materialPurchase.setUpdateTime(LocalDateTime.now());

        if (!StringUtils.hasText(materialPurchase.getStatus())) {
            materialPurchase.setStatus("pending");
        }

        if (materialPurchase.getUnitPrice() == null) {
            materialPurchase.setUnitPrice(BigDecimal.ZERO);
        }
        int arrived = materialPurchase.getArrivedQuantity() == null ? 0 : materialPurchase.getArrivedQuantity();
        materialPurchase.setTotalAmount(materialPurchase.getUnitPrice().multiply(BigDecimal.valueOf(arrived)));

        ensureSnapshot(materialPurchase);

        // 更新物料采购记录
        return this.updateById(materialPurchase);
    }

    private void ensureSnapshot(MaterialPurchase materialPurchase) {
        if (materialPurchase == null) {
            return;
        }

        if (StringUtils.hasText(materialPurchase.getOrderId())) {
            ProductionOrder order = productionOrderService.getDetailById(materialPurchase.getOrderId());
            if (order != null) {
                if (!StringUtils.hasText(materialPurchase.getOrderNo())) {
                    materialPurchase.setOrderNo(order.getOrderNo());
                }
                if (!StringUtils.hasText(materialPurchase.getStyleId())) {
                    materialPurchase.setStyleId(order.getStyleId());
                }
                if (!StringUtils.hasText(materialPurchase.getStyleNo())) {
                    materialPurchase.setStyleNo(order.getStyleNo());
                }
                if (!StringUtils.hasText(materialPurchase.getStyleName())) {
                    materialPurchase.setStyleName(order.getStyleName());
                }
            }
        }

        if (StringUtils.hasText(materialPurchase.getStyleId())
                && (!StringUtils.hasText(materialPurchase.getStyleNo())
                        || !StringUtils.hasText(materialPurchase.getStyleName())
                        || !StringUtils.hasText(materialPurchase.getStyleCover()))) {
            Long styleId = tryParseLong(materialPurchase.getStyleId());
            if (styleId != null) {
                StyleInfo info = styleInfoService.getById(styleId);
                if (info != null) {
                    if (!StringUtils.hasText(materialPurchase.getStyleNo())) {
                        materialPurchase.setStyleNo(info.getStyleNo());
                    }
                    if (!StringUtils.hasText(materialPurchase.getStyleName())) {
                        materialPurchase.setStyleName(info.getStyleName());
                    }
                    if (!StringUtils.hasText(materialPurchase.getStyleCover())
                            && StringUtils.hasText(info.getCover())) {
                        materialPurchase.setStyleCover(info.getCover());
                    }
                }
            }
        }

        if (!StringUtils.hasText(materialPurchase.getStyleCover())
                && StringUtils.hasText(materialPurchase.getStyleId())) {
            String cover = resolveStyleCoverByStyleId(materialPurchase.getStyleId());
            if (StringUtils.hasText(cover)) {
                materialPurchase.setStyleCover(cover);
            }
        }

        if (!StringUtils.hasText(materialPurchase.getMaterialId())) {
            String mid = resolveMaterialId(materialPurchase);
            if (StringUtils.hasText(mid)) {
                materialPurchase.setMaterialId(mid);
            }
        }
    }

    private Long tryParseLong(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            return Long.valueOf(raw.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private String resolveStyleCoverByStyleId(String styleId) {
        Long id = tryParseLong(styleId);
        if (id == null) {
            return null;
        }

        try {
            StyleInfo info = styleInfoService.getById(id);
            if (info != null && StringUtils.hasText(info.getCover())) {
                return info.getCover();
            }
        } catch (Exception e) {
            log.warn("Failed to query style info for cover resolve: styleId={}", id, e);
        }

        try {
            List<StyleAttachment> attachments = styleAttachmentService.listByStyleId(String.valueOf(id));
            if (attachments == null || attachments.isEmpty()) {
                return null;
            }
            for (StyleAttachment a : attachments) {
                if (a == null) {
                    continue;
                }
                if (!StringUtils.hasText(a.getFileUrl())) {
                    continue;
                }
                if (looksLikeImage(a)) {
                    return a.getFileUrl();
                }
            }
        } catch (Exception e) {
            log.warn("Failed to query style attachments for cover resolve: styleId={}", id, e);
        }

        return null;
    }

    private boolean looksLikeImage(StyleAttachment a) {
        String t = a.getFileType() == null ? "" : a.getFileType().toLowerCase();
        if (t.contains("image")) {
            return true;
        }
        String name = a.getFileName() == null ? "" : a.getFileName().toLowerCase();
        String url = a.getFileUrl() == null ? "" : a.getFileUrl().toLowerCase();
        return name.endsWith(".jpg")
                || name.endsWith(".jpeg")
                || name.endsWith(".png")
                || name.endsWith(".gif")
                || name.endsWith(".webp")
                || name.endsWith(".bmp")
                || url.contains(".jpg")
                || url.contains(".jpeg")
                || url.contains(".png")
                || url.contains(".gif")
                || url.contains(".webp")
                || url.contains(".bmp");
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
        int clampedArrived = Math.min(aq, purchaseQty);
        int threshold = calcArrivedCompleteThreshold(purchaseQty);
        return (threshold > 0 && aq >= threshold) ? purchaseQty : clampedArrived;
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
                int pq = p.getPurchaseQuantity() == null ? 0 : p.getPurchaseQuantity();
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

    private int calcArrivedCompleteThreshold(int purchaseQty) {
        if (purchaseQty <= 0) {
            return 0;
        }
        long pq = purchaseQty;
        return (int) ((pq * 20L + 99L) / 100L);
    }

    private String resolveStatusByArrived(String previousStatus, int arrivedQty, int purchaseQty) {
        String prev = previousStatus == null ? "" : previousStatus.trim();
        if (arrivedQty <= 0) {
            return "received".equals(prev) ? "received" : "pending";
        }
        int threshold = calcArrivedCompleteThreshold(purchaseQty);
        if (threshold <= 0) {
            return "completed";
        }
        if (arrivedQty < threshold) {
            return "partial";
        }
        return "completed";
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateArrivedQuantity(String id, Integer arrivedQuantity) {
        // 查询物料采购记录
        MaterialPurchase materialPurchase = this.getById(id);
        if (materialPurchase == null) {
            return false;
        }

        // 更新到货数量
        materialPurchase.setArrivedQuantity(arrivedQuantity);
        materialPurchase.setUpdateTime(LocalDateTime.now());

        if (materialPurchase.getUnitPrice() != null) {
            int arrivedQty = arrivedQuantity == null ? 0 : arrivedQuantity;
            materialPurchase.setTotalAmount(materialPurchase.getUnitPrice().multiply(BigDecimal.valueOf(arrivedQty)));
        }

        String currentStatus = materialPurchase.getStatus() == null ? "" : materialPurchase.getStatus().trim();
        if (!"cancelled".equals(currentStatus)) {
            int purchaseQty = materialPurchase.getPurchaseQuantity() == null ? 0
                    : materialPurchase.getPurchaseQuantity();
            int arrivedQty = arrivedQuantity == null ? 0 : arrivedQuantity;
            materialPurchase.setStatus(resolveStatusByArrived(currentStatus, arrivedQty, purchaseQty));
        }

        // 更新物料采购记录
        return this.updateById(materialPurchase);
    }

    @Override
    public List<MaterialPurchase> previewDemandByOrderId(String orderId) {
        return buildDemandItems(orderId);
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
            MaterialPurchase toUpdate = new MaterialPurchase();
            toUpdate.setDeleteFlag(1);
            toUpdate.setUpdateTime(LocalDateTime.now());
            this.update(toUpdate, new LambdaQueryWrapper<MaterialPurchase>()
                    .eq(MaterialPurchase::getOrderId, orderId)
                    .eq(MaterialPurchase::getDeleteFlag, 0));
        }

        List<MaterialPurchase> items = buildDemandItems(orderId);
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
        if ("completed".equals(status) || "cancelled".equals(status)) {
            return false;
        }

        String who = StringUtils.hasText(receiverName) ? receiverName.trim()
                : (StringUtils.hasText(receiverId) ? receiverId.trim() : "");
        if (!StringUtils.hasText(who)) {
            who = "未命名";
        }

        MaterialPurchase patch = new MaterialPurchase();
        patch.setId(purchaseId);
        patch.setReceiverId(StringUtils.hasText(receiverId) ? receiverId.trim() : null);
        patch.setReceiverName(StringUtils.hasText(receiverName) ? receiverName.trim() : who);
        patch.setReceivedTime(LocalDateTime.now());
        patch.setUpdateTime(LocalDateTime.now());
        if ("pending".equals(status)) {
            patch.setStatus("received");
        }
        return this.updateById(patch);
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

        if (existed.getReturnConfirmed() != null && existed.getReturnConfirmed() == 1) {
            return false;
        }

        String status = existed.getStatus() == null ? "" : existed.getStatus().trim();
        if ("cancelled".equals(status)) {
            return false;
        }

        if (returnQuantity == null) {
            return false;
        }
        int rq = returnQuantity;
        if (rq < 0) {
            return false;
        }
        int purchaseQty = existed.getPurchaseQuantity() == null ? 0 : existed.getPurchaseQuantity();
        int arrivedQty = existed.getArrivedQuantity() == null ? 0 : existed.getArrivedQuantity();
        int max = arrivedQty > 0 ? arrivedQty : purchaseQty;
        if (max >= 0 && rq > max) {
            return false;
        }

        String who = StringUtils.hasText(confirmerName) ? confirmerName.trim()
                : (StringUtils.hasText(confirmerId) ? confirmerId.trim() : "");
        if (!StringUtils.hasText(who)) {
            who = "未命名";
        }

        String prefix = "回料确认:";
        String remark = existed.getRemark() == null ? "" : existed.getRemark().trim();
        if (!remark.contains(prefix)) {
            String time = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
            String add = prefix + who + " " + time;
            remark = remark.isEmpty() ? add : (remark + "；" + add);
        }

        MaterialPurchase patch = new MaterialPurchase();
        patch.setId(purchaseId);
        patch.setReturnConfirmed(1);
        patch.setReturnQuantity(rq);

        patch.setArrivedQuantity(rq);
        BigDecimal unitPrice = existed.getUnitPrice() == null ? BigDecimal.ZERO : existed.getUnitPrice();
        patch.setTotalAmount(unitPrice.multiply(BigDecimal.valueOf(rq)));

        int pq = existed.getPurchaseQuantity() == null ? 0 : existed.getPurchaseQuantity();
        patch.setStatus(resolveStatusByArrived(status, rq, pq));

        patch.setReturnConfirmerId(StringUtils.hasText(confirmerId) ? confirmerId.trim() : null);
        patch.setReturnConfirmerName(StringUtils.hasText(confirmerName) ? confirmerName.trim() : who);
        patch.setReturnConfirmTime(LocalDateTime.now());
        patch.setRemark(remark);
        patch.setUpdateTime(LocalDateTime.now());

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

        MaterialPurchase patch = new MaterialPurchase();
        patch.setId(purchaseId);
        patch.setReturnConfirmed(0);
        patch.setReturnQuantity(null);
        patch.setReturnConfirmerId(null);
        patch.setReturnConfirmerName(null);
        patch.setReturnConfirmTime(null);
        patch.setRemark(remark);
        patch.setUpdateTime(LocalDateTime.now());
        return this.updateById(patch);
    }

    private List<OrderLine> parseOrderLines(ProductionOrder order) {
        if (order == null) {
            return List.of();
        }

        String raw = order.getOrderDetails();
        if (!StringUtils.hasText(raw)) {
            OrderLine line = new OrderLine();
            line.color = StringUtils.hasText(order.getColor()) ? order.getColor() : "";
            line.size = StringUtils.hasText(order.getSize()) ? order.getSize() : "";
            line.quantity = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
            return List.of(line);
        }

        try {
            List<OrderLine> lines = objectMapper.readValue(raw, new TypeReference<List<OrderLine>>() {
            });
            if (lines == null) {
                return List.of();
            }
            List<OrderLine> cleaned = new ArrayList<>();
            for (OrderLine l : lines) {
                if (l == null) {
                    continue;
                }
                OrderLine next = new OrderLine();
                next.color = l.color == null ? "" : l.color.trim();
                next.size = l.size == null ? "" : l.size.trim();
                next.quantity = l.quantity == null ? 0 : l.quantity;
                cleaned.add(next);
            }
            return cleaned;
        } catch (Exception e) {
            OrderLine line = new OrderLine();
            line.color = StringUtils.hasText(order.getColor()) ? order.getColor() : "";
            line.size = StringUtils.hasText(order.getSize()) ? order.getSize() : "";
            line.quantity = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
            return List.of(line);
        }
    }

    private List<MaterialPurchase> buildDemandItems(String orderId) {
        ProductionOrder order = productionOrderService.getDetailById(orderId);
        if (order == null) {
            throw new NoSuchElementException("生产订单不存在");
        }
        if (!StringUtils.hasText(order.getStyleId())) {
            throw new IllegalArgumentException("生产订单缺少styleId");
        }

        Long styleId;
        try {
            styleId = Long.valueOf(order.getStyleId());
        } catch (Exception e) {
            throw new IllegalArgumentException("styleId格式错误");
        }

        List<StyleBom> bomList = styleBomService.listByStyleId(styleId);
        if (bomList == null) {
            bomList = List.of();
        }

        List<OrderLine> lines = parseOrderLines(order);

        Set<String> orderColorSet = new HashSet<>();
        Set<String> orderSizeSet = new HashSet<>();
        for (OrderLine l : lines) {
            if (l == null) {
                continue;
            }
            String lc = normalizeMatchKey(l.color);
            String ls = normalizeMatchKey(l.size);
            if (StringUtils.hasText(lc)) {
                orderColorSet.add(lc);
            }
            if (StringUtils.hasText(ls)) {
                orderSizeSet.add(ls);
            }
        }

        Map<String, MaterialPurchase> grouped = new HashMap<>();
        for (StyleBom bom : bomList) {
            if (bom == null) {
                continue;
            }
            String bomColor = bom.getColor() == null ? "" : bom.getColor().trim();
            String bomSize = bom.getSize() == null ? "" : bom.getSize().trim();

            List<String> bomColorOpts = splitOptions(bomColor);
            Set<String> bomColorSet = bomColorOpts.isEmpty() ? null : new HashSet<>(bomColorOpts);
            List<String> bomSizeOpts = splitOptions(bomSize);
            Set<String> bomSizeSet = bomSizeOpts.isEmpty() ? null : new HashSet<>(bomSizeOpts);

            bomColorSet = intersectOrNull(bomColorSet, orderColorSet);
            bomSizeSet = intersectOrNull(bomSizeSet, orderSizeSet);

            int matchedQty = 0;
            for (OrderLine l : lines) {
                if (l == null) {
                    continue;
                }
                String lc = normalizeMatchKey(l.color);
                String ls = normalizeMatchKey(l.size);
                boolean colorOk = bomColorSet == null || bomColorSet.contains(lc);
                boolean sizeOk = bomSizeSet == null || bomSizeSet.contains(ls);
                if (colorOk && sizeOk) {
                    matchedQty += l.quantity == null ? 0 : l.quantity;
                }
            }
            if (matchedQty <= 0) {
                continue;
            }

            BigDecimal usage = bom.getUsageAmount() == null ? BigDecimal.ZERO : bom.getUsageAmount();
            BigDecimal lossRate = bom.getLossRate() == null ? BigDecimal.ZERO : bom.getLossRate();
            BigDecimal multiplier = BigDecimal.ONE
                    .add(lossRate.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
            BigDecimal required = usage.multiply(multiplier).multiply(BigDecimal.valueOf(matchedQty));
            int requiredInt = required.setScale(0, RoundingMode.CEILING).intValue();

            if (requiredInt <= 0) {
                continue;
            }

            String key = String.join("|",
                    StringUtils.hasText(bom.getMaterialCode()) ? bom.getMaterialCode() : "",
                    StringUtils.hasText(bom.getMaterialName()) ? bom.getMaterialName() : "",
                    StringUtils.hasText(bom.getSpecification()) ? bom.getSpecification() : "",
                    StringUtils.hasText(bom.getUnit()) ? bom.getUnit() : "",
                    bomColor,
                    bomSize,
                    StringUtils.hasText(bom.getSupplier()) ? bom.getSupplier() : "");

            MaterialPurchase agg = grouped.get(key);
            if (agg == null) {
                MaterialPurchase mp = new MaterialPurchase();
                mp.setPurchaseNo(nextPurchaseNo());
                mp.setMaterialCode(bom.getMaterialCode());
                mp.setMaterialName(bom.getMaterialName());
                mp.setMaterialType(normalizeMaterialType(bom.getMaterialType()));
                mp.setSpecifications(bom.getSpecification());
                mp.setUnit(bom.getUnit());
                mp.setPurchaseQuantity(requiredInt);
                mp.setArrivedQuantity(0);
                mp.setSupplierName(bom.getSupplier());
                mp.setSupplierId("");
                mp.setUnitPrice(bom.getUnitPrice() == null ? BigDecimal.ZERO : bom.getUnitPrice());
                mp.setTotalAmount(BigDecimal.ZERO);
                mp.setOrderId(order.getId());
                mp.setOrderNo(order.getOrderNo());
                mp.setStyleId(order.getStyleId());
                mp.setStyleNo(order.getStyleNo());
                mp.setStyleName(order.getStyleName());
                mp.setMaterialId(resolveMaterialId(mp));
                mp.setStyleCover(resolveStyleCoverByStyleId(order.getStyleId()));
                mp.setStatus("pending");
                LocalDateTime now = LocalDateTime.now();
                mp.setCreateTime(now);
                mp.setUpdateTime(now);
                mp.setDeleteFlag(0);
                grouped.put(key, mp);
            } else {
                int nextQty = (agg.getPurchaseQuantity() == null ? 0 : agg.getPurchaseQuantity()) + requiredInt;
                agg.setPurchaseQuantity(nextQty);
                agg.setTotalAmount(BigDecimal.ZERO);
            }
        }

        return new ArrayList<>(grouped.values());
    }

    private String nextPurchaseNo() {
        LocalDateTime now = LocalDateTime.now();
        String ts = now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS"));
        for (int i = 0; i < 6; i++) {
            int rand = (int) (Math.random() * 900) + 100;
            String candidate = "PUR" + ts + rand;
            long cnt = this
                    .count(new LambdaQueryWrapper<MaterialPurchase>().eq(MaterialPurchase::getPurchaseNo, candidate));
            if (cnt == 0) {
                return candidate;
            }
        }
        String nano = String.valueOf(System.nanoTime());
        String suffix = nano.length() > 6 ? nano.substring(nano.length() - 6) : nano;
        return "PUR" + ts + suffix;
    }

    /**
     * 更新生产订单的物料到位率
     * 
     * @param orderId 生产订单ID
     */
}
