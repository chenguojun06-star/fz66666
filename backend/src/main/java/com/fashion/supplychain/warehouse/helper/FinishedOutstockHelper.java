package com.fashion.supplychain.warehouse.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import com.fashion.supplychain.finance.service.BillAggregationService;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

@Component
@Slf4j
public class FinishedOutstockHelper {

    private final ProductSkuService productSkuService;
    private final ProductOutstockService productOutstockService;
    private final StyleInfoService styleInfoService;

    @Lazy
    @Autowired
    private EcommerceOrderOrchestrator ecommerceOrderOrchestrator;

    @Autowired
    private BillAggregationOrchestrator billAggregationOrchestrator;

    @Autowired
    private BillAggregationService billAggregationService;

    public FinishedOutstockHelper(ProductSkuService productSkuService,
                                  ProductOutstockService productOutstockService,
                                  StyleInfoService styleInfoService) {
        this.productSkuService = productSkuService;
        this.productOutstockService = productOutstockService;
        this.styleInfoService = styleInfoService;
    }

    @Transactional(rollbackFor = Exception.class)
    public void outbound(Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) params.get("items");
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("出库明细不能为空");
        }
        String requestOrderId = trimToNull(params.get("orderId"));
        String requestOrderNo = trimToNull(params.get("orderNo"));
        String requestWarehouse = trimToNull(params.get("warehouseLocation"));
        String trackingNo = trimToNull(params.get("trackingNo"));
        String expressCompany = trimToNull(params.get("expressCompany"));
        String customerName = trimToNull(params.get("customerName"));
        if (!StringUtils.hasText(customerName)) {
            throw new IllegalArgumentException("出库必须选择客户");
        }
        String customerPhone = trimToNull(params.get("customerPhone"));
        String shippingAddress = trimToNull(params.get("shippingAddress"));

        for (Map<String, Object> item : items) {
            String skuCode = (String) item.get("sku");
            if (!StringUtils.hasText(skuCode)) {
                throw new IllegalArgumentException("SKU编码不能为空");
            }
            int quantity = Integer.parseInt(item.getOrDefault("quantity", "0").toString());
            if (quantity <= 0) {
                throw new IllegalArgumentException("出库数量必须大于0: " + skuCode);
            }
            LambdaQueryWrapper<ProductSku> wrapper = new LambdaQueryWrapper<ProductSku>()
                    .eq(ProductSku::getSkuCode, skuCode);
            ProductSku sku = productSkuService.getOne(wrapper);
            if (sku == null) {
                throw new IllegalArgumentException("SKU不存在: " + skuCode);
            }
            boolean updated = productSkuService.decreaseStockBySkuCode(skuCode, quantity);
            if (!updated) {
                int current = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
                throw new IllegalArgumentException(
                        "库存不足: " + skuCode + "，可用库存:" + current + "件，申请出库:" + quantity + "件");
            }

                recordProductOutstock(sku, quantity, requestOrderId, requestOrderNo, requestWarehouse,
                    "成品库存页面出库|sku=" + skuCode, trackingNo, expressCompany,
                    customerName, customerPhone, shippingAddress);
        }
        String productionOrderNo = (String) params.get("productionOrderNo");
        if (StringUtils.hasText(productionOrderNo)) {
            try {
                ecommerceOrderOrchestrator.onWarehouseOutbound(productionOrderNo,
                        trackingNo != null ? trackingNo : "", expressCompany != null ? expressCompany : "");
            } catch (Exception ex) {
                log.warn("[EC回写失败不阻塞主流程] productionOrderNo={} err={}", productionOrderNo, ex.getMessage());
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void qrcodeOutbound(Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) params.get("items");
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("出库明细不能为空");
        }
        Map<String, Integer> skuQtyMap = new java.util.LinkedHashMap<>();
        for (Map<String, Object> item : items) {
            String qrCode = (String) item.get("qrCode");
            if (!StringUtils.hasText(qrCode)) {
                throw new IllegalArgumentException("二维码内容不能为空");
            }
            int quantity = Integer.parseInt(item.getOrDefault("quantity", "1").toString());
            if (quantity <= 0) {
                throw new IllegalArgumentException("出库数量必须大于0: " + qrCode);
            }
            String[] parts = qrCode.split("-");
            String skuCode = parts.length > 3
                    ? String.join("-", java.util.Arrays.copyOf(parts, parts.length - 1))
                    : qrCode;
            skuQtyMap.merge(skuCode, quantity, Integer::sum);
        }
        List<Map<String, Object>> stdItems = new java.util.ArrayList<>();
        for (Map.Entry<String, Integer> e : skuQtyMap.entrySet()) {
            Map<String, Object> m = new java.util.HashMap<>();
            m.put("sku", e.getKey());
            m.put("quantity", e.getValue());
            stdItems.add(m);
        }
        Map<String, Object> outboundParams = new java.util.HashMap<>(params);
        outboundParams.put("items", stdItems);
        outbound(outboundParams);
    }

    private void recordProductOutstock(ProductSku sku,
                                       int quantity,
                                       String orderId,
                                       String orderNo,
                                       String warehouse,
                                       String remark,
                                       String trackingNo,
                                       String expressCompany,
                                       String customerName,
                                       String customerPhone,
                                       String shippingAddress) {
        ProductOutstock outstock = new ProductOutstock();
        LocalDateTime now = LocalDateTime.now();
        StyleInfo styleInfo = sku.getStyleId() == null ? null : styleInfoService.getById(sku.getStyleId());
        outstock.setOutstockNo(buildOutstockNo(now));
        outstock.setOrderId(orderId);
        outstock.setOrderNo(StringUtils.hasText(orderNo)
                ? orderNo
                : styleInfo != null && StringUtils.hasText(styleInfo.getOrderNo()) ? styleInfo.getOrderNo() : null);
        outstock.setStyleId(sku.getStyleId() == null ? null : String.valueOf(sku.getStyleId()));
        outstock.setStyleNo(StringUtils.hasText(sku.getStyleNo())
                ? sku.getStyleNo()
                : styleInfo != null ? styleInfo.getStyleNo() : null);
        outstock.setStyleName(styleInfo != null ? styleInfo.getStyleName() : null);
        outstock.setOutstockQuantity(quantity);
        outstock.setOutstockType("shipment");
        outstock.setWarehouse(warehouse);
        outstock.setRemark(remark);
        outstock.setSkuCode(sku.getSkuCode());
        outstock.setColor(sku.getColor());
        outstock.setSize(sku.getSize());
        outstock.setCostPrice(sku.getCostPrice());
        outstock.setSalesPrice(sku.getSalesPrice());
        outstock.setTrackingNo(trackingNo);
        outstock.setExpressCompany(expressCompany);
        outstock.setCustomerName(customerName);
        outstock.setCustomerPhone(customerPhone);
        outstock.setShippingAddress(shippingAddress);
        if (sku.getSalesPrice() != null) {
            outstock.setTotalAmount(sku.getSalesPrice().multiply(BigDecimal.valueOf(quantity)));
        }
        outstock.setPaidAmount(BigDecimal.ZERO);
        outstock.setPaymentStatus("unpaid");
        outstock.setApprovalStatus("pending");
        String ctxUserId = UserContext.userId();
        String ctxUsername = UserContext.username();
        outstock.setOperatorId(ctxUserId);
        outstock.setOperatorName(ctxUsername);
        outstock.setCreatorId(ctxUserId);
        outstock.setCreatorName(ctxUsername);
        outstock.setCreateTime(now);
        outstock.setUpdateTime(now);
        outstock.setDeleteFlag(0);
        productOutstockService.save(outstock);
    }

    public IPage<ProductOutstock> listOutstockRecords(Map<String, Object> params) {
        int page = Integer.parseInt(params.getOrDefault("page", "1").toString());
        int pageSize = Integer.parseInt(params.getOrDefault("pageSize", "20").toString());
        Long tenantId = UserContext.tenantId();
        TenantAssert.assertTenantContext();

        LambdaQueryWrapper<ProductOutstock> wrapper = new LambdaQueryWrapper<ProductOutstock>()
                .eq(ProductOutstock::getTenantId, tenantId)
                .eq(ProductOutstock::getDeleteFlag, 0);

        String keyword = trimToNull(params.get("keyword"));
        if (keyword != null) {
            wrapper.and(w -> w.like(ProductOutstock::getOutstockNo, keyword)
                    .or().like(ProductOutstock::getOrderNo, keyword)
                    .or().like(ProductOutstock::getStyleNo, keyword)
                    .or().like(ProductOutstock::getSkuCode, keyword)
                    .or().like(ProductOutstock::getTrackingNo, keyword));
        }

        String outstockType = trimToNull(params.get("outstockType"));
        if (outstockType != null) {
            wrapper.eq(ProductOutstock::getOutstockType, outstockType);
        }

        String paymentStatus = trimToNull(params.get("paymentStatus"));
        if (paymentStatus != null) {
            wrapper.eq(ProductOutstock::getPaymentStatus, paymentStatus);
        }

        String approvalStatus = trimToNull(params.get("approvalStatus"));
        if (approvalStatus != null) {
            wrapper.eq(ProductOutstock::getApprovalStatus, approvalStatus);
        }

        String customerName = trimToNull(params.get("customerName"));
        if (customerName != null) {
            wrapper.like(ProductOutstock::getCustomerName, customerName);
        }

        wrapper.orderByDesc(ProductOutstock::getCreateTime);
        return productOutstockService.page(new Page<>(page, pageSize), wrapper);
    }

    @Transactional(rollbackFor = Exception.class)
    public void confirmPayment(String id, BigDecimal paidAmount) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("出库记录ID不能为空");
        }
        if (paidAmount == null || paidAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("收款金额必须大于0");
        }
        ProductOutstock outstock = productOutstockService.getById(id);
        if (outstock == null) {
            throw new IllegalArgumentException("出库记录不存在");
        }
        Long tenantId = UserContext.tenantId();
        if (!tenantId.equals(outstock.getTenantId())) {
            throw new SecurityException("无权操作该出库记录");
        }

        BigDecimal currentPaid = outstock.getPaidAmount() != null ? outstock.getPaidAmount() : BigDecimal.ZERO;
        BigDecimal newPaid = currentPaid.add(paidAmount);
        outstock.setPaidAmount(newPaid);

        BigDecimal total = outstock.getTotalAmount();
        if (total != null && newPaid.compareTo(total) >= 0) {
            outstock.setPaymentStatus("paid");
            outstock.setSettlementTime(LocalDateTime.now());
        } else {
            outstock.setPaymentStatus("partial");
        }
        outstock.setUpdateTime(LocalDateTime.now());
        productOutstockService.updateById(outstock);
        syncOutstockBillAfterPayment(outstock);
    }

    private void syncOutstockBillAfterPayment(ProductOutstock outstock) {
        if (outstock == null || !StringUtils.hasText(outstock.getId())) {
            return;
        }
        Long tenantId = UserContext.tenantId();
        BillAggregation bill = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, "PRODUCT_OUTSTOCK")
                .eq(BillAggregation::getSourceId, outstock.getId())
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (bill == null) {
            return;
        }

        BigDecimal paid = outstock.getPaidAmount() != null ? outstock.getPaidAmount() : BigDecimal.ZERO;
        if (bill.getAmount() != null && paid.compareTo(bill.getAmount()) > 0) {
            paid = bill.getAmount();
        }
        bill.setSettledAmount(paid);
        if (bill.getAmount() != null && paid.compareTo(bill.getAmount()) >= 0) {
            bill.setStatus("SETTLED");
            bill.setSettledAt(LocalDateTime.now());
            bill.setSettledById(UserContext.userId());
            bill.setSettledByName(UserContext.username());
        } else if (paid.compareTo(BigDecimal.ZERO) > 0) {
            bill.setStatus("SETTLING");
        }
        billAggregationService.updateById(bill);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> approveOutstock(String id, String remark) {
        ProductOutstock outstock = productOutstockService.getById(id);
        if (outstock == null) {
            throw new IllegalArgumentException("出库记录不存在");
        }
        Long tenantId = UserContext.tenantId();
        if (!tenantId.equals(outstock.getTenantId())) {
            throw new SecurityException("无权审批该出库记录");
        }
        if ("approved".equals(outstock.getApprovalStatus())) {
            throw new IllegalArgumentException("该记录已审批，不可重复操作");
        }
        outstock.setApprovalStatus("approved");
        outstock.setApproveBy(UserContext.userId());
        outstock.setApproveByName(UserContext.username());
        outstock.setApproveTime(LocalDateTime.now());
        outstock.setUpdateTime(LocalDateTime.now());
        if (StringUtils.hasText(remark)) {
            outstock.setRemark(outstock.getRemark() != null ? outstock.getRemark() + " | 审批: " + remark : "审批: " + remark);
        }
        productOutstockService.updateById(outstock);
        pushOutstockBill(outstock);
        log.info("[成品出库审批] outstockNo={}", outstock.getOutstockNo());
        return Map.of("id", id, "status", "approved");
    }

    @Transactional(rollbackFor = Exception.class)
    public List<Map<String, Object>> batchApproveOutstocks(List<String> ids, String remark) {
        List<Map<String, Object>> results = new java.util.ArrayList<>();
        for (String id : ids) {
            try {
                Map<String, Object> r = approveOutstock(id, remark);
                r = new java.util.HashMap<>(r);
                r.put("success", true);
                results.add(r);
            } catch (Exception e) {
                results.add(Map.of("id", id, "success", false, "message", e.getMessage()));
            }
        }
        return results;
    }

    private void pushOutstockBill(ProductOutstock outstock) {
        try {
            if (outstock.getOrderId() != null) {
                boolean hasShipmentBill = billAggregationOrchestrator.billExists("SHIPMENT_RECONCILIATION", outstock.getOrderId());
                if (hasShipmentBill) {
                    log.info("[出库账单推送跳过] 订单{}已有成品对账账单，避免重复应收: outstockNo={}",
                            outstock.getOrderId(), outstock.getOutstockNo());
                    return;
                }
            }
            BillAggregationOrchestrator.BillPushRequest req = new BillAggregationOrchestrator.BillPushRequest();
            req.setBillType("RECEIVABLE");
            req.setBillCategory("PRODUCT");
            req.setSourceType("PRODUCT_OUTSTOCK");
            req.setSourceId(outstock.getId());
            req.setSourceNo(outstock.getOutstockNo());
            req.setCounterpartyType("CUSTOMER");
            req.setCounterpartyName(outstock.getCustomerName());
            req.setOrderNo(outstock.getOrderNo());
            req.setStyleNo(outstock.getStyleNo());
            req.setAmount(outstock.getTotalAmount());
            req.setRemark("成品出库审批通过: " + outstock.getOutstockNo());
            billAggregationOrchestrator.pushBill(req);
        } catch (Exception e) {
            log.error("[出库账单推送失败] outstockNo={} err={}", outstock.getOutstockNo(), e.getMessage());
        }
    }

    private String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return StringUtils.hasText(text) ? text : null;
    }

    private String buildOutstockNo(LocalDateTime now) {
        return "FI" + now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + Integer.toHexString(ThreadLocalRandom.current().nextInt(0x1000, 0x10000)).toUpperCase(Locale.ROOT);
    }
}
