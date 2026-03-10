package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.intelligence.dto.ExecutionResult;
import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.mapper.IntelligenceAuditLogMapper;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 执行引擎业务桥接 Facade
 *
 * 职责：统一管理 AI 执行引擎与真实业务 Service 之间的桥接，
 * 避免执行引擎直接依赖多个业务 Service。
 */
@Slf4j
@Service
public class IntelligenceServiceFacade {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private IntelligenceAuditLogMapper auditLogMapper;

    /**
     * 获取订单信息
     */
    public ProductionOrder getOrderInfo(String orderNo) {
        log.info("[Facade] 查询订单: {}", orderNo);
        return productionOrderService.getByOrderNo(orderNo);
    }

    /**
     * 更新订单状态
     */
    public void updateOrderStatus(String orderNo, String status) {
        log.info("[Facade] 更新订单状态: {} → {}", orderNo, status);
        ProductionOrder order = productionOrderService.getByOrderNo(orderNo);
        if (order == null) {
            log.warn("[Facade] 订单不存在: {}", orderNo);
            return;
        }
        order.setStatus(status);
        productionOrderService.updateById(order);
    }

    /**
     * 检查面辅料库存
     */
    public Integer checkInventory(String materialName) {
        log.info("[Facade] 检查库存: {}", materialName);
        QueryWrapper<MaterialStock> qw = new QueryWrapper<>();
        qw.like("material_name", materialName).last("LIMIT 1");
        MaterialStock stock = materialStockService.getOne(qw);
        if (stock == null) {
            return 0;
        }
        return stock.getQuantity() != null ? stock.getQuantity().intValue() : 0;
    }

    /**
     * 通知团队（记录到审计日志，便于追踪）
     */
    public void notifyTeam(String message, String... recipients) {
        log.info("[Facade] 团队通知: {} → {}", message, String.join(",", recipients));
        IntelligenceAuditLog logEntry = new IntelligenceAuditLog();
        logEntry.setAction("notify_team");
        logEntry.setReason(message);
        logEntry.setRemark("recipients=" + String.join(",", recipients));
        logEntry.setStatus("SUCCESS");
        logEntry.setCreatedAt(LocalDateTime.now());
        auditLogMapper.insert(logEntry);
    }

    /**
     * 记录审计日志
     */
    public void recordAudit(ExecutableCommand command, ExecutionResult<?> result) {
        log.info("[Facade] 审计记录: cmd={}, success={}", command.getCommandId(), result.isSuccess());
        IntelligenceAuditLog logEntry = new IntelligenceAuditLog();
        logEntry.setAction(command.getAction());
        logEntry.setCommandId(command.getCommandId());
        logEntry.setTargetId(command.getTargetId());
        logEntry.setReason(command.getReason());
        logEntry.setResultData(result.getMessage());
        logEntry.setStatus(result.isSuccess() ? "SUCCESS" : "FAILED");
        logEntry.setCreatedAt(LocalDateTime.now());
        auditLogMapper.insert(logEntry);
    }
}
