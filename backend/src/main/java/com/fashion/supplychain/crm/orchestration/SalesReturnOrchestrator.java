package com.fashion.supplychain.crm.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
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
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 销售退货单编排器（P0铁律2：事务边界在Orchestrator层）
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

    // ─── 查询 ───────────────────────────────────────────────────────────────

    public IPage<SalesReturn> queryPage(Map<String, Object> params) {
        int page = parseInt(params.get("page"), 1);
        int pageSize = parseInt(params.get("pageSize"), 20);
        Long tenantId = TenantAssert.requireTenantId();

        LambdaQueryWrapper<SalesReturn> wrapper = new LambdaQueryWrapper<SalesReturn>()
                .eq(SalesReturn::getDeleteFlag, 0)
                .eq(SalesReturn::getTenantId, tenantId)
                .orderByDesc(SalesReturn::getCreateTime);

        String returnNo = (String) params.get("returnNo");
        if (StringUtils.hasText(returnNo)) {
            wrapper.like(SalesReturn::getReturnNo, returnNo);
        }

        String originalOrderNo = (String) params.get("originalOrderNo");
        if (StringUtils.hasText(originalOrderNo)) {
            wrapper.like(SalesReturn::getOriginalOrderNo, originalOrderNo);
        }

        String customerName = (String) params.get("customerName");
        if (StringUtils.hasText(customerName)) {
            wrapper.like(SalesReturn::getCustomerName, customerName);
        }

        String returnStatus = (String) params.get("returnStatus");
        if (StringUtils.hasText(returnStatus)) {
            wrapper.eq(SalesReturn::getReturnStatus, returnStatus);
        }

        return salesReturnService.page(new Page<>(page, pageSize), wrapper);
    }

    public Map<String, Object> getDetailById(Long id) {
        Long tenantId = TenantAssert.requireTenantId();
        SalesReturn returnOrder = salesReturnService.lambdaQuery()
                .eq(SalesReturn::getId, id)
                .eq(SalesReturn::getTenantId, tenantId)
                .eq(SalesReturn::getDeleteFlag, 0)
                .one();
        if (returnOrder == null) {
            throw new IllegalArgumentException("退货单不存在或无权查看");
        }
        // 查询明细
        List<SalesReturnItem> items = salesReturnItemService.lambdaQuery()
                .eq(SalesReturnItem::getReturnId, id)
                .eq(SalesReturnItem::getTenantId, tenantId)
                .list();
        // 组装返回结果（SalesReturn 实体无 items 字段，用 Map 注入避免明细丢失）
        Map<String, Object> result = new java.util.HashMap<>();
        result.put("returnOrder", returnOrder);
        result.put("items", items);
        return result;
    }

    public List<SalesReturnItem> getReturnItems(Long returnId) {
        Long tenantId = TenantAssert.requireTenantId();
        return salesReturnItemService.lambdaQuery()
                .eq(SalesReturnItem::getReturnId, returnId)
                .eq(SalesReturnItem::getTenantId, tenantId)
                .list();
    }

    // ─── 写入 ───────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public Long createSalesReturn(CreateSalesReturnRequest request) {
        Long tenantId = TenantAssert.requireTenantId();
        UserContext ctx = UserContext.get();

        // 1. 校验原订单存在且属于当前租户
        ProductionOrder originalOrder = productionOrderService.getById(request.getOriginalOrderId());
        if (originalOrder == null || !originalOrder.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("原订单不存在或无权操作");
        }

        // 2. 生成退货单号
        String returnNo = generateReturnNo();

        // 3. 计算退货类型
        String returnType = calculateReturnType(request.getOriginalOrderId(), request.getItems());

        // 4. 创建退货单
        SalesReturn returnOrder = new SalesReturn();
        returnOrder.setTenantId(tenantId);
        returnOrder.setReturnNo(returnNo);
        returnOrder.setOriginalOrderId(request.getOriginalOrderId());
        returnOrder.setOriginalOrderNo(originalOrder.getOrderNo());
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

        // 5. 计算总金额并保存退货单
        BigDecimal totalAmount = BigDecimal.ZERO;
        salesReturnService.save(returnOrder);

        // 6. 创建退货商品明细
        for (SalesReturnItemRequest itemReq : request.getItems()) {
            SalesReturnItem item = new SalesReturnItem();
            item.setTenantId(tenantId);
            item.setReturnId(returnOrder.getId());
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

        // 7. 更新退货单总金额
        returnOrder.setTotalAmount(totalAmount);
        salesReturnService.updateById(returnOrder);

        log.info("[销售退货] 创建退货单: returnNo={}, originalOrderNo={}, totalAmount={}",
                returnNo, originalOrder.getOrderNo(), totalAmount);
        return returnOrder.getId();
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
        // P2#6: 审核备注结构化追加（含时间、操作人、动作），避免多次操作污染历史备注
        if (StringUtils.hasText(request.getApproveRemark())) {
            returnOrder.setRemark(appendAuditTrail(returnOrder.getRemark(),
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
            returnOrder.setRemark(appendAuditTrail(returnOrder.getRemark(),
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

        log.info("[销售退货] 标记退款完成: returnId={}, status=REFUNDED", returnId);
    }

    // ─── 工具 ───────────────────────────────────────────────────────────────

    private String generateReturnNo() {
        // P1#2: 加 3 位随机数防止同毫秒并发碰撞
        return "SR" + DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS").format(LocalDateTime.now())
                + ThreadLocalRandom.current().nextInt(100, 1000);
    }

    /**
     * 结构化追加审核备注（P2#6）
     * 格式：[2026-07-04 12:00:00][张三][审核通过] 备注内容
     * 多次审核会在新行追加，时间/操作人/动作清晰可辨，避免污染历史备注
     */
    private String appendAuditTrail(String existingRemark, String action, String operator, String reason) {
        String timestamp = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").format(LocalDateTime.now());
        String operatorName = operator != null ? operator : "系统";
        String entry = "[" + timestamp + "][" + operatorName + "][" + action + "] " + reason;
        if (existingRemark == null || existingRemark.isBlank()) {
            return entry;
        }
        return existingRemark + "\n" + entry;
    }

    private String calculateReturnType(Long originalOrderId, List<SalesReturnItemRequest> items) {
        ProductionOrder order = productionOrderService.getById(originalOrderId);
        if (order == null) {
            return "PARTIAL";
        }
        Integer orderQty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
        int returnQty = items.stream()
                .mapToInt(i -> i.getQuantity() != null ? i.getQuantity() : 0)
                .sum();
        return returnQty >= orderQty ? "FULL" : "PARTIAL";
    }

    private int parseInt(Object val, int def) {
        if (val == null) return def;
        try {
            return Integer.parseInt(val.toString());
        } catch (NumberFormatException e) {
            return def;
        }
    }
}