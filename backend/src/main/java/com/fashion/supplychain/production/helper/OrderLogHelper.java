package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.OrderOperationLog;
import com.fashion.supplychain.production.service.OrderOperationLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

/**
 * 大货订单操作日志写入辅助类（与 StyleLogHelper 同构）
 * 统一封装订单侧操作记录：writeOrderLog(orderNo, orderId, action, remark)，
 * 自动记录操作人 + 时间；try/catch 不阻断主流程（沿用样衣侧的降级风格）。
 */
@Slf4j
@Component
public class OrderLogHelper {

    @Autowired
    private OrderOperationLogService orderOperationLogService;

    public void writeOrderLog(String orderNo, Long orderId, String action, String remark) {
        try {
            if (orderId == null && !StringUtils.hasText(orderNo)) {
                return;
            }
            OrderOperationLog record = new OrderOperationLog();
            record.setOrderId(orderId);
            record.setOrderNo(StringUtils.hasText(orderNo) ? orderNo : null);
            record.setAction(action);
            UserContext ctx = UserContext.get();
            record.setOperator(ctx != null && StringUtils.hasText(ctx.getUsername()) ? ctx.getUsername() : "系统");
            record.setRemark(remark);
            record.setCreateTime(LocalDateTime.now());
            orderOperationLogService.save(record);
        } catch (Exception e) {
            log.warn("[OrderLog] 写订单操作日志失败: orderNo={}, action={}, err={}", orderNo, action, e.getMessage());
        }
    }
}