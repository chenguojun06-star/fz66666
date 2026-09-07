package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.service.OrderRemarkService;
import java.time.LocalDateTime;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 订单操作记录 Helper
 *
 * <p>系统操作日志不再写入 ProductionOrder.remarks（备注仅保留人工备注），
 * 统一写入 t_operation_log（模块=生产订单）+ t_order_remark（订单操作时间线，结构化展示用）。
 */
@Component
@Slf4j
public class OrderRemarkHelper {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired(required = false)
    private OrderRemarkService orderRemarkService;

    public void append(ProductionOrder order, String action, String detail) {
        if (order == null || !StringUtils.hasText(order.getId())) {
            return;
        }
        String operatorName = getOperatorName();
        String newRemark = OperationLogAppendUtil.buildLogEntry(action, detail);
        ProductionOrder fresh = productionOrderService.getById(order.getId());
        if (fresh == null) {
            return;
        }
        String orderNo = fresh.getOrderNo();

        // 1) 统一写入 t_operation_log（数据操作日志，多租户隔离）
        OperationLogAppendUtil.writeLog("生产订单", action, detail, fresh.getId(), orderNo);

        // 2) 结构化订单操作时间线（独立表，非 remarks 列）
        try {
            OrderRemark record = new OrderRemark();
            record.setTargetType("order");
            record.setTargetNo(orderNo);
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
        } catch (Exception e) {
            log.warn("[OrderRemark] 获取当前用户失败: {}", e.getMessage());
        }
        return "系统";
    }
}