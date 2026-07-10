package com.fashion.supplychain.crm.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.crm.dto.ApproveSalesReturnRequest;
import com.fashion.supplychain.crm.dto.CreateSalesReturnRequest;
import com.fashion.supplychain.crm.dto.SalesReturnItemRequest;
import com.fashion.supplychain.crm.entity.SalesReturn;
import com.fashion.supplychain.crm.entity.SalesReturnItem;
import com.fashion.supplychain.crm.service.SalesReturnItemService;
import com.fashion.supplychain.crm.service.SalesReturnService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 销售退货 Orchestrator（P2#10 拆分后）
 * 事务边界：创建退货单 + 审核/拒绝退货单 + 标记退款
 *
 * 拆分原则（不影响数据链路）：
 *   - 查询/工具方法 → SalesReturnQueryHelper
 *   - Orchestrator 只保留事务边界 + 流程编排
 *
 * 符合 P0 铁律 #1：@Transactional 只在 Orchestrator 层
 */
@Slf4j
@Service
public class SalesReturnOrchestrator {

    @Autowired
    private SalesReturnService salesReturnService;

    @Autowired
    private SalesReturnItemService salesReturnItemService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private EcommerceOrderService ecommerceOrderService;

    @Autowired
    private SalesReturnQueryHelper queryHelper;

    // ─── 查询委托给 Helper（保持 API 契约不变）─────────────────────────────

    public IPage<SalesReturn> queryPage(Map<String, Object> params) {
        return queryHelper.queryPage(params);
    }

    public Map<String, Object> getDetailById(Long id) {
        return queryHelper.getDetailById(id);
    }

    public List<SalesReturnItem> getReturnItems(Long returnId) {
        return queryHelper.getReturnItems(returnId);
    }

    // ─── 写入（事务边界）──────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public Long createSalesReturn(CreateSalesReturnRequest request) {
        Long tenantId = TenantAssert.requireTenantId();
        UserContext ctx = UserContext.get();

        // 1. 校验原订单存在且属于当前租户
        ProductionOrder originalOrder = productionOrderService.getById(request.getOriginalOrderId());
        if (originalOrder == null || !originalOrder.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("原订单不存在或无权操作");
        }

        // 2. 生成退货单号（P1#2: 加随机后缀防碰撞）
        String returnNo = queryHelper.generateReturnNo();

        // 3. 计算退货类型
        String returnType = queryHelper.calculateReturnType(request.getOriginalOrderId(), request.getItems());

        // 4. 创建退货单主表
        SalesReturn returnOrder = new SalesReturn();
        returnOrder.setTenantId(tenantId);
        returnOrder.setReturnNo(returnNo);
        returnOrder.setOriginalOrderId(request.getOriginalOrderId());
        returnOrder.setOriginalOrderNo(originalOrder.getOrderNo());
        returnOrder.setEcommerceOrderId(request.getEcommerceOrderId());
        returnOrder.setCustomerId(originalOrder.getCustomerId());
        returnOrder.setCustomerName(originalOrder.getCompany());
        returnOrder.setReturnType(returnType);
        returnOrder.setReturnReason(request.getReturnReason());
        returnOrder.setReturnStatus("PENDING");
        returnOrder.setRemark(request.getRemark());
        returnOrder.setCreateTime(LocalDateTime.now());
        returnOrder.setUpdateTime(LocalDateTime.now());
        returnOrder.setDeleteFlag(0);
        if (ctx != null) {
            returnOrder.setOperatorId(ctx.getUserId());
            returnOrder.setOperatorName(ctx.getUsername());
        }
        salesReturnService.save(returnOrder);

        // 5. 创建退货商品明细 + 累计总金额
        BigDecimal totalAmount = saveReturnItems(request.getItems(), returnOrder.getId(), tenantId);

        // 6. 更新退货单总金额
        returnOrder.setTotalAmount(totalAmount);
        salesReturnService.updateById(returnOrder);

        log.info("[销售退货] 创建退货单: returnNo={}, originalOrderNo={}, totalAmount={}",
                returnNo, originalOrder.getOrderNo(), totalAmount);
        return returnOrder.getId();
    }

    /**
     * 保存退货明细并返回总金额
     */
    private BigDecimal saveReturnItems(List<SalesReturnItemRequest> items, Long returnId, Long tenantId) {
        BigDecimal totalAmount = BigDecimal.ZERO;
        for (SalesReturnItemRequest itemReq : items) {
            SalesReturnItem item = new SalesReturnItem();
            item.setTenantId(tenantId);
            item.setReturnId(returnId);
            item.setStyleId(itemReq.getStyleId());
            item.setStyleNo(itemReq.getStyleNo());
            item.setStyleName(itemReq.getStyleName());
            item.setColor(itemReq.getColor());
            item.setSize(itemReq.getSize());
            item.setQuantity(itemReq.getQuantity() != null ? itemReq.getQuantity() : 0);
            item.setUnitPrice(itemReq.getUnitPrice() != null ? itemReq.getUnitPrice() : BigDecimal.ZERO);
            BigDecimal amount = item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
            item.setAmount(amount);
            item.setReturnReason(itemReq.getReturnReason());
            item.setCreateTime(LocalDateTime.now());
            salesReturnItemService.save(item);
            totalAmount = totalAmount.add(amount);
        }
        return totalAmount;
    }

    @Transactional(rollbackFor = Exception.class)
    public void approveSalesReturn(ApproveSalesReturnRequest request) {
        Long tenantId = TenantAssert.requireTenantId();
        UserContext ctx = UserContext.get();

        SalesReturn returnOrder = salesReturnService.lambdaQuery()
                .eq(SalesReturn::getId, request.getReturnId())
                .eq(SalesReturn::getTenantId, tenantId)
                .eq(SalesReturn::getDeleteFlag, 0)
                .one();
        if (returnOrder == null) {
            throw new IllegalArgumentException("退货单不存在或无权操作");
        }
        if (!"PENDING".equals(returnOrder.getReturnStatus())) {
            throw new IllegalArgumentException("退货单状态不是待审核，无法审核");
        }

        returnOrder.setReturnStatus("APPROVED");
        returnOrder.setApproveTime(LocalDateTime.now());
        returnOrder.setRefundAmount(request.getRefundAmount() != null ? request.getRefundAmount() : returnOrder.getTotalAmount());
        returnOrder.setUpdateTime(LocalDateTime.now());
        if (ctx != null) {
            returnOrder.setApproveUserId(ctx.getUserId());
            returnOrder.setApproveUserName(ctx.getUsername());
        }
        // P2#6: 审核备注结构化追加
        if (StringUtils.hasText(request.getApproveRemark())) {
            returnOrder.setRemark(queryHelper.appendAuditTrail(returnOrder.getRemark(),
                    "审核通过", ctx != null ? ctx.getUsername() : null, request.getApproveRemark()));
        }

        salesReturnService.updateById(returnOrder);

        // 如果是全部退货，更新原订单状态
        if ("FULL".equals(returnOrder.getReturnType())) {
            ProductionOrder originalOrder = productionOrderService.getById(returnOrder.getOriginalOrderId());
            if (originalOrder != null && originalOrder.getTenantId().equals(tenantId)) {
                originalOrder.setStatus("returned");
                originalOrder.setUpdateTime(LocalDateTime.now());
                productionOrderService.updateById(originalOrder);
            }
        }

        // 电商退货：审核通过时更新电商订单状态为"退款中"(status=5)
        if (returnOrder.getEcommerceOrderId() != null) {
            EcommerceOrder ecOrder = ecommerceOrderService.getById(returnOrder.getEcommerceOrderId());
            if (ecOrder != null && ecOrder.getTenantId().equals(tenantId)) {
                ecOrder.setStatus(5);
                ecOrder.setUpdateTime(LocalDateTime.now());
                ecommerceOrderService.updateById(ecOrder);
            }
        }

        log.info("[销售退货] 审核退货单: returnId={}, status=APPROVED", request.getReturnId());
    }

    @Transactional(rollbackFor = Exception.class)
    public void rejectSalesReturn(Long returnId, String rejectReason) {
        Long tenantId = TenantAssert.requireTenantId();
        UserContext ctx = UserContext.get();

        SalesReturn returnOrder = salesReturnService.lambdaQuery()
                .eq(SalesReturn::getId, returnId)
                .eq(SalesReturn::getTenantId, tenantId)
                .eq(SalesReturn::getDeleteFlag, 0)
                .one();
        if (returnOrder == null) {
            throw new IllegalArgumentException("退货单不存在或无权操作");
        }
        if (!"PENDING".equals(returnOrder.getReturnStatus())) {
            throw new IllegalArgumentException("退货单状态不是待审核，无法拒绝");
        }

        returnOrder.setReturnStatus("REJECTED");
        returnOrder.setUpdateTime(LocalDateTime.now());
        if (ctx != null) {
            returnOrder.setApproveUserId(ctx.getUserId());
            returnOrder.setApproveUserName(ctx.getUsername());
        }
        // P2#6: 拒绝原因结构化追加
        if (StringUtils.hasText(rejectReason)) {
            returnOrder.setRemark(queryHelper.appendAuditTrail(returnOrder.getRemark(),
                    "拒绝", ctx != null ? ctx.getUsername() : null, rejectReason));
        }

        salesReturnService.updateById(returnOrder);
        log.info("[销售退货] 拒绝退货单: returnId={}, status=REJECTED", returnId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void markRefunded(Long returnId) {
        Long tenantId = TenantAssert.requireTenantId();

        SalesReturn returnOrder = salesReturnService.lambdaQuery()
                .eq(SalesReturn::getId, returnId)
                .eq(SalesReturn::getTenantId, tenantId)
                .eq(SalesReturn::getDeleteFlag, 0)
                .one();
        if (returnOrder == null) {
            throw new IllegalArgumentException("退货单不存在或无权操作");
        }
        if (!"APPROVED".equals(returnOrder.getReturnStatus())) {
            throw new IllegalArgumentException("退货单状态不是已审核，无法标记退款");
        }

        returnOrder.setReturnStatus("REFUNDED");
        returnOrder.setRefundTime(LocalDateTime.now());
        returnOrder.setUpdateTime(LocalDateTime.now());
        salesReturnService.updateById(returnOrder);

        // 电商退货：退款完成后更新电商订单状态为"已取消"(status=4)
        if (returnOrder.getEcommerceOrderId() != null) {
            EcommerceOrder ecOrder = ecommerceOrderService.getById(returnOrder.getEcommerceOrderId());
            if (ecOrder != null && ecOrder.getTenantId().equals(tenantId)) {
                ecOrder.setStatus(4);
                ecOrder.setUpdateTime(LocalDateTime.now());
                ecommerceOrderService.updateById(ecOrder);
            }
        }

        log.info("[销售退货] 标记退款完成: returnId={}, status=REFUNDED", returnId);
    }
}
