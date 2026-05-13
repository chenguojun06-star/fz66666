package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.service.OrderRemarkService;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class OrderRemarkHelper {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final int MAX_LENGTH = 4000;
    private static final int MAX_ENTRIES = 10;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired(required = false)
    private OrderRemarkService orderRemarkService;

    public void append(ProductionOrder order, String action, String detail) {
        if (order == null || !StringUtils.hasText(order.getId())) {
            return;
        }
        String operatorName = getOperatorName();
        String now = LocalDateTime.now().format(FMT);
        StringBuilder line = new StringBuilder();
        line.append("[").append(now).append("] ");
        line.append(operatorName).append("-").append(action);
        if (StringUtils.hasText(detail)) {
            line.append("-").append(detail);
        }
        String newRemark = line.toString();
        ProductionOrder fresh = productionOrderService.getById(order.getId());
        if (fresh == null) {
            return;
        }
        String existing = fresh.getRemarks();
        String merged;
        if (!StringUtils.hasText(existing)) {
            merged = newRemark;
        } else {
            merged = existing + "\n" + newRemark;
        }
        if (merged.length() > MAX_LENGTH) {
            merged = truncate(merged);
        }
        fresh.setRemarks(merged);
        productionOrderService.updateById(fresh);

        try {
            OrderRemark record = new OrderRemark();
            record.setTargetType("order");
            record.setTargetNo(fresh.getOrderNo());
            record.setAuthorName(operatorName);
            record.setAuthorRole(action);
            record.setContent(newRemark);
            record.setTenantId(fresh.getTenantId());
            record.setCreateTime(LocalDateTime.now());
            record.setDeleteFlag(0);
            if (orderRemarkService != null) {
                orderRemarkService.save(record);
            }
        } catch (Exception e) {
            log.debug("OrderRemark同步失败: orderId={}", order.getId());
        }
    }

    private String truncate(String remarks) {
        if (remarks == null || remarks.length() <= MAX_LENGTH) {
            return remarks;
        }
        String[] lines = remarks.split("\n");
        if (lines.length <= MAX_ENTRIES) {
            return remarks.substring(0, MAX_LENGTH);
        }
        StringBuilder sb = new StringBuilder();
        for (int i = lines.length - MAX_ENTRIES; i < lines.length; i++) {
            if (sb.length() > 0) {
                sb.append("\n");
            }
            sb.append(lines[i]);
        }
        String result = sb.toString();
        if (result.length() > MAX_LENGTH) {
            result = result.substring(0, MAX_LENGTH);
        }
        return result;
    }

    private String getOperatorName() {
        try {
            String name = UserContext.username();
            if (StringUtils.hasText(name)) {
                return name;
            }
            String uid = UserContext.userId();
            if (StringUtils.hasText(uid)) {
                return uid;
            }
        } catch (Exception ignored) {
        }
        return "系统";
    }
}