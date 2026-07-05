package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorProfile;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.service.DistributorProfileService;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * B2B 分销订单 Orchestrator（Phase 4）
 * <p>
 * 与电商订单共享 t_ecommerce_order 表（通过 order_type=B2B 区分），
 * 复用 Phase 2 智能分仓/合单/赠品规则，复用 Phase 3 物流异常检测。
 * <p>
 * 新增能力：
 * 1. 阶梯价自动匹配（调用 DistributorOrchestrator.querySupplyPrice）
 * 2. 账期额度占用/释放（DISTRIBUTOR 结算周期非 CASH 时校验额度）
 * 3. B2B 订单默认走"待供应商确认"流程（status=1 待发货）
 *
 * <p>事务边界在此层（D-001），Service 层无 @Transactional
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class B2BOrderOrchestrator {

    private final EcommerceOrderService orderService;
    private final DistributorProfileService profileService;
    private final DistributorOrchestrator distributorOrchestrator;

    /** B2B 订单列表 */
    public List<EcommerceOrder> listB2BOrders(String keyword, String distributorLevel, Integer status) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<EcommerceOrder> wrapper = new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getTenantId, tenantId)
                .eq(EcommerceOrder::getOrderType, "B2B")
                .like(keyword != null && !keyword.isBlank(), EcommerceOrder::getOrderNo, keyword)
                .eq(status != null, EcommerceOrder::getStatus, status)
                .orderByDesc(EcommerceOrder::getCreateTime);
        // 按分销商等级过滤
        if (distributorLevel != null && !distributorLevel.isBlank()) {
            List<DistributorProfile> distributors = profileService.listByTenant(tenantId, null, distributorLevel, null);
            if (distributors.isEmpty()) return List.of();
            List<Long> ids = distributors.stream().map(DistributorProfile::getId).toList();
            wrapper.in(EcommerceOrder::getDistributorId, ids);
        }
        return orderService.list(wrapper);
    }

    /**
     * 创建 B2B 分销订单
     * 1. 校验分销商存在且 ACTIVE
     * 2. 阶梯价匹配 → 计算 unitPrice/totalAmount
     * 3. 账期额度占用（非 CASH 结算）
     * 4. 落库 order_type=B2B，status=1（待发货）
     */
    @Transactional(rollbackFor = Exception.class)
    public EcommerceOrder createB2BOrder(EcommerceOrder order) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (order.getDistributorId() == null) {
            throw new IllegalArgumentException("B2B 订单必须指定分销商");
        }
        if (order.getSkuCode() == null || order.getQuantity() == null || order.getQuantity() <= 0) {
            throw new IllegalArgumentException("SKU 编码与数量必须填写");
        }

        // 1. 校验分销商
        DistributorProfile distributor = profileService.getByIdAndTenant(tenantId, order.getDistributorId());
        if (distributor == null) throw new IllegalArgumentException("分销商不存在或已删除");
        if (!"ACTIVE".equals(distributor.getStatus())) {
            throw new IllegalArgumentException("分销商状态非 ACTIVE，禁止下单");
        }

        // 2. 阶梯价匹配
        BigDecimal supplyPrice = distributorOrchestrator.querySupplyPrice(
                order.getDistributorId(), order.getSkuCode(), order.getQuantity());
        if (supplyPrice == null) {
            throw new IllegalArgumentException("未匹配到生效价格政策，请先配置 SKU=" + order.getSkuCode() + " 的供货价");
        }
        order.setUnitPrice(supplyPrice);
        BigDecimal totalAmount = supplyPrice.multiply(BigDecimal.valueOf(order.getQuantity()));
        if (order.getFreight() == null) order.setFreight(BigDecimal.ZERO);
        if (order.getDiscount() == null) order.setDiscount(BigDecimal.ZERO);
        order.setTotalAmount(totalAmount.add(order.getFreight()).subtract(order.getDiscount()));
        order.setPayAmount(order.getTotalAmount());

        // 3. 账期额度占用（非 CASH 结算需要校验）
        if (!"CASH".equals(distributor.getSettlementCycle())) {
            boolean ok = profileService.occupyCredit(tenantId, order.getDistributorId(), order.getPayAmount());
            if (!ok) {
                throw new IllegalArgumentException("信用额度不足，已用 "
                        + distributor.getUsedCredit() + " / 额度 " + distributor.getCreditLimit()
                        + "，本次需占用 " + order.getPayAmount());
            }
        }

        // 4. 落库
        order.setTenantId(tenantId);
        order.setOrderType("B2B");
        if (order.getOrderNo() == null || order.getOrderNo().isBlank()) {
            order.setOrderNo("B2B-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                    + "-" + (int) (Math.random() * 1000));
        }
        if (order.getPlatform() == null) order.setPlatform("B2B");
        if (order.getStatus() == null) order.setStatus(1); // 待发货
        if (order.getWarehouseStatus() == null) order.setWarehouseStatus(0);
        if (order.getIsPresale() == null) order.setIsPresale(0);
        orderService.save(order);
        log.info("[B2BOrder] 创建 B2B 订单 tenantId={} orderNo={} distributorId={} supplyPrice={} total={}",
                tenantId, order.getOrderNo(), order.getDistributorId(), supplyPrice, order.getTotalAmount());
        return order;
    }

    /**
     * 取消 B2B 订单（释放额度）
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancelB2BOrder(Long orderId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        EcommerceOrder order = orderService.getById(orderId);
        if (order == null || !"B2B".equals(order.getOrderType())
                || !order.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("B2B 订单不存在");
        }
        if (order.getStatus() != null && order.getStatus() >= 3) {
            throw new IllegalArgumentException("订单状态不允许取消");
        }
        // 释放额度
        if (order.getDistributorId() != null && order.getPayAmount() != null) {
            profileService.releaseCredit(tenantId, order.getDistributorId(), order.getPayAmount());
        }
        order.setStatus(4); // 已取消
        order.setCompleteTime(LocalDateTime.now());
        orderService.updateById(order);
        log.info("[B2BOrder] 取消订单 orderNo={} distributorId={} releaseCredit={}",
                order.getOrderNo(), order.getDistributorId(), order.getPayAmount());
    }

    /** B2B 订单详情 */
    public EcommerceOrder getB2BOrder(Long id) {
        Long tenantId = UserContext.tenantId();
        EcommerceOrder order = orderService.getById(id);
        if (order == null || !"B2B".equals(order.getOrderType())
                || !order.getTenantId().equals(tenantId)) {
            return null;
        }
        return order;
    }

    /**
     * B2B 订单发货
     * status: 1（待发货）→ 2（已发货）
     */
    @Transactional(rollbackFor = Exception.class)
    public void shipB2BOrder(Long orderId, String trackingNo, String expressCompany) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        EcommerceOrder order = orderService.getById(orderId);
        if (order == null || !"B2B".equals(order.getOrderType())
                || !order.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("B2B 订单不存在");
        }
        if (order.getStatus() == null || order.getStatus() != 1) {
            throw new IllegalArgumentException("订单状态不是待发货，无法发货");
        }
        order.setStatus(2);
        order.setTrackingNo(trackingNo);
        order.setExpressCompany(expressCompany);
        order.setShipTime(LocalDateTime.now());
        order.setWarehouseStatus(2);
        orderService.updateById(order);
        log.info("[B2BOrder] 发货 orderNo={} trackingNo={} express={}",
                order.getOrderNo(), trackingNo, expressCompany);
    }

    /**
     * B2B 订单确认收货
     * status: 2（已发货）→ 3（已完成）
     * 账期订单完成后不释放额度（已在下单时占用，结算后才释放）
     */
    @Transactional(rollbackFor = Exception.class)
    public void confirmB2BOrder(Long orderId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        EcommerceOrder order = orderService.getById(orderId);
        if (order == null || !"B2B".equals(order.getOrderType())
                || !order.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("B2B 订单不存在");
        }
        if (order.getStatus() == null || order.getStatus() != 2) {
            throw new IllegalArgumentException("订单状态不是已发货，无法确认收货");
        }
        order.setStatus(3);
        order.setCompleteTime(LocalDateTime.now());
        orderService.updateById(order);
        log.info("[B2BOrder] 确认收货 orderNo={}", order.getOrderNo());
    }
}
