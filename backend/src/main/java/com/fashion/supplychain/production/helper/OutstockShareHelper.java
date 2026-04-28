package com.fashion.supplychain.production.helper;

import cn.hutool.jwt.JWT;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.warehouse.dto.OutstockShareResponse;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class OutstockShareHelper {

    private static final DateTimeFormatter DATETIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final long SHARE_TTL_MS = 30L * 24 * 60 * 60 * 1000;

    private final OrderShareHelper orderShareHelper;
    private final ProductOutstockService productOutstockService;

    public OutstockShareHelper(OrderShareHelper orderShareHelper, ProductOutstockService productOutstockService) {
        this.orderShareHelper = orderShareHelper;
        this.productOutstockService = productOutstockService;
    }

    public String generateOutstockShareToken(String customerName) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalStateException("未登录，无法生成分享链接");
        }
        if (customerName == null || customerName.isBlank()) {
            throw new IllegalArgumentException("客户名称不能为空");
        }
        long now = System.currentTimeMillis();
        String token = JWT.create()
                .setPayload("type", "outstock_share")
                .setPayload("customerName", customerName)
                .setPayload("tenantId", String.valueOf(tenantId))
                .setIssuedAt(new Date(now))
                .setExpiresAt(new Date(now + SHARE_TTL_MS))
                .setKey(orderShareHelper.jwtSecret())
                .sign();
        log.info("[OutstockShare] 生成出库分享令牌 customerName={} tenantId={}", customerName, tenantId);
        return token;
    }

    public Result<OutstockShareResponse> resolveOutstockShare(String token) {
        if (token == null || token.isBlank()) {
            return Result.fail("无效的分享链接");
        }
        try {
            JWT jwt = JWT.of(token).setKey(orderShareHelper.jwtSecret());
            if (!jwt.verify() || !jwt.validate(0)) {
                return Result.fail("分享链接已过期或无效");
            }
            String type = (String) jwt.getPayload("type");
            if (!"outstock_share".equals(type)) {
                return Result.fail("无效的分享类型");
            }
            String customerName = (String) jwt.getPayload("customerName");
            String tenantIdStr = (String) jwt.getPayload("tenantId");
            Long tenantId = Long.parseLong(tenantIdStr);

            List<ProductOutstock> records = productOutstockService.lambdaQuery()
                    .eq(ProductOutstock::getTenantId, tenantId)
                    .eq(ProductOutstock::getCustomerName, customerName)
                    .eq(ProductOutstock::getDeleteFlag, 0)
                    .orderByDesc(ProductOutstock::getCreateTime)
                    .last("LIMIT 500")
                    .list();

            OutstockShareResponse resp = new OutstockShareResponse();
            resp.setToken(token);
            resp.setCustomerName(customerName);
            resp.setExpiresAt(((Date) jwt.getPayload("exp")).getTime());

            if (!records.isEmpty()) {
                ProductOutstock first = records.get(0);
                resp.setCustomerPhone(first.getCustomerPhone());
                resp.setShippingAddress(first.getShippingAddress());
            }

            List<OutstockShareResponse.OutstockItem> items = new ArrayList<>();
            int totalQty = 0;
            java.math.BigDecimal totalAmt = java.math.BigDecimal.ZERO;

            for (ProductOutstock r : records) {
                OutstockShareResponse.OutstockItem item = new OutstockShareResponse.OutstockItem();
                item.setOutstockNo(r.getOutstockNo());
                item.setOrderNo(r.getOrderNo());
                item.setStyleNo(r.getStyleNo());
                item.setStyleName(r.getStyleName());
                item.setColor(r.getColor());
                item.setSize(r.getSize());
                item.setOutstockQuantity(r.getOutstockQuantity());
                item.setSalesPrice(r.getSalesPrice());
                item.setTotalAmount(r.getTotalAmount());
                item.setTrackingNo(r.getTrackingNo());
                item.setExpressCompany(r.getExpressCompany());
                item.setOutstockTime(r.getCreateTime() != null ? r.getCreateTime().format(DATETIME_FMT) : null);
                item.setPaymentStatus(r.getPaymentStatus());
                items.add(item);
                if (r.getOutstockQuantity() != null) totalQty += r.getOutstockQuantity();
                if (r.getTotalAmount() != null) totalAmt = totalAmt.add(r.getTotalAmount());
            }

            resp.setItems(items);
            resp.setTotalQuantity(totalQty);
            resp.setTotalAmount(totalAmt);
            return Result.success(resp);
        } catch (Exception e) {
            log.warn("[OutstockShare] 解析分享令牌失败: {}", e.getMessage());
            return Result.fail("分享链接无效");
        }
    }
}
