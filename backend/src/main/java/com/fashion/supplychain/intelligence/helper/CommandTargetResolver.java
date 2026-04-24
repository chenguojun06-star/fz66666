package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import com.fashion.supplychain.intelligence.orchestration.ExecutionEngineOrchestrator;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class CommandTargetResolver {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private FinishedProductSettlementService finishedProductSettlementService;

    @Autowired
    private PayrollSettlementService payrollSettlementService;

    public ProductionOrder requireOrder(String orderId) {
        ProductionOrder order = findOrder(orderId);
        if (order == null) {
            throw new ExecutionEngineOrchestrator.BusinessException("订单不存在或无权限: " + orderId);
        }
        return order;
    }

    public ProductionOrder findOrder(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return null;
        }
        Long tenantId = requireTenantId();
        String target = orderId.trim();
        var query = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .and(w -> w.eq(ProductionOrder::getOrderNo, target)
                        .or()
                        .eq(ProductionOrder::getId, target))
                .last("LIMIT 1");

        String factoryId = UserContext.factoryId();
        if (StringUtils.hasText(factoryId)) {
            query.eq(ProductionOrder::getFactoryId, factoryId);
        }
        return query.one();
    }

    public StyleInfo requireStyle(String styleId) {
        StyleInfo style = findStyle(styleId);
        if (style == null) {
            throw new ExecutionEngineOrchestrator.BusinessException("款式不存在或无权限: " + styleId);
        }
        return style;
    }

    public StyleInfo findStyle(String styleId) {
        if (!StringUtils.hasText(styleId)) {
            return null;
        }
        Long tenantId = requireTenantId();
        return styleInfoService.lambdaQuery()
                .eq(StyleInfo::getId, styleId.trim())
                .eq(StyleInfo::getTenantId, tenantId)
                .last("LIMIT 1")
                .one();
    }

    public FinishedProductSettlement requireFinishedSettlement(String settlementId) {
        FinishedProductSettlement settlement = findFinishedSettlement(settlementId);
        if (settlement == null) {
            throw new ExecutionEngineOrchestrator.BusinessException("结算单不存在或无权限: " + settlementId);
        }
        return settlement;
    }

    public FinishedProductSettlement findFinishedSettlement(String settlementId) {
        if (!StringUtils.hasText(settlementId)) {
            return null;
        }
        Long tenantId = requireTenantId();
        return finishedProductSettlementService.lambdaQuery()
            .eq(FinishedProductSettlement::getOrderId, settlementId.trim())
                .eq(FinishedProductSettlement::getTenantId, tenantId)
                .last("LIMIT 1")
                .one();
    }

    public PayrollSettlement requirePayrollSettlement(String settlementId) {
        if (!StringUtils.hasText(settlementId)) {
            throw new ExecutionEngineOrchestrator.BusinessException("结算单ID不能为空");
        }
        Long tenantId = requireTenantId();
        PayrollSettlement settlement = payrollSettlementService.lambdaQuery()
                .eq(PayrollSettlement::getId, settlementId.trim())
                .eq(PayrollSettlement::getTenantId, tenantId)
                .last("LIMIT 1")
                .one();
        if (settlement == null) {
            throw new ExecutionEngineOrchestrator.BusinessException("工资结算单不存在或无权限: " + settlementId);
        }
        return settlement;
    }

    public MaterialStock requireMaterialStock(String stockId) {
        if (!StringUtils.hasText(stockId)) {
            throw new ExecutionEngineOrchestrator.BusinessException("库存ID不能为空");
        }
        Long tenantId = requireTenantId();
        MaterialStock stock = materialStockService.lambdaQuery()
                .eq(MaterialStock::getId, stockId.trim())
                .eq(MaterialStock::getTenantId, tenantId)
                .last("LIMIT 1")
                .one();
        if (stock == null) {
            throw new ExecutionEngineOrchestrator.BusinessException("库存记录不存在或无权限: " + stockId);
        }
        return stock;
    }

    private Long requireTenantId() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new ExecutionEngineOrchestrator.BusinessException("租户上下文丢失，请重新登录");
        }
        return tenantId;
    }
}
