package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.EcSalesRevenue;
import com.fashion.supplychain.finance.service.EcSalesRevenueService;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
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

/**
 * 电商销售收入编排器（第87号）
 * <p>
 * 职责：
 *   1. 出库时根据 EC 订单快照自动生成销售收入流水（status=pending）
 *   2. 财务确认/核账：pending → confirmed → reconciled
 *   3. 分页查询供财务模块展示
 * <p>
 * 调用方：EcommerceOrderOrchestrator.onWarehouseOutbound()（出库回写时触发）
 */
@Slf4j
@Service
public class EcSalesRevenueOrchestrator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    @Autowired
    private EcSalesRevenueService ecSalesRevenueService;

    @Autowired
    private BillAggregationOrchestrator billAggregationOrchestrator;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. 出库时自动生成收入流水（幂等：同一 EC 订单仅记录一次）
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public void recordOnOutbound(EcommerceOrder order) {
        if (order == null || order.getId() == null) return;

        // 幂等：同一订单只写一条（带 tenant_id 隔离，P0铁律4）
        Long count = ecSalesRevenueService.count(
                new LambdaQueryWrapper<EcSalesRevenue>()
                        .eq(EcSalesRevenue::getEcOrderId, order.getId())
                        .eq(EcSalesRevenue::getTenantId, order.getTenantId()));
        if (count > 0) {
            log.info("[EC收入] 已存在流水，跳过（ecOrderId={}）", order.getId());
            return;
        }

        EcSalesRevenue rev = new EcSalesRevenue();
        rev.setRevenueNo(genRevenueNo(order.getPlatform()));
        rev.setEcOrderId(order.getId());
        rev.setEcOrderNo(order.getOrderNo());
        rev.setPlatformOrderNo(order.getPlatformOrderNo());
        rev.setPlatform(order.getPlatform());
        rev.setShopName(order.getShopName());
        rev.setProductName(order.getProductName());
        rev.setSkuCode(order.getSkuCode());
        rev.setQuantity(order.getQuantity());
        rev.setUnitPrice(order.getUnitPrice());
        rev.setTotalAmount(order.getTotalAmount());
        rev.setPayAmount(order.getPayAmount());
        rev.setFreight(order.getFreight());
        rev.setDiscount(order.getDiscount());
        rev.setProductionOrderNo(order.getProductionOrderNo());
        rev.setShipTime(LocalDateTime.now());
        rev.setStatus("confirmed");
        rev.setTenantId(order.getTenantId());

        ecSalesRevenueService.save(rev);
        log.info("[EC收入] 出库自动生成流水并已确认 revenueNo={} ecOrderNo={} payAmount={}",
                rev.getRevenueNo(), order.getOrderNo(), order.getPayAmount());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. 财务核账（pending → confirmed）
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public void confirm(Long id, String remark) {
        Long tenantId = com.fashion.supplychain.common.tenant.TenantAssert.requireTenantId();
        EcSalesRevenue rev = ecSalesRevenueService.getOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<EcSalesRevenue>()
                        .eq(EcSalesRevenue::getId, id)
                        .eq(EcSalesRevenue::getTenantId, tenantId));
        if (rev == null) throw new IllegalArgumentException("收入流水不存在: " + id);
        if (!"pending".equals(rev.getStatus())) {
            throw new IllegalStateException("仅 pending 状态可确认，当前状态=" + rev.getStatus());
        }
        checkTenant(rev.getTenantId());
        rev.setStatus("confirmed");
        rev.setRemark(StringUtils.hasText(remark) ? remark : rev.getRemark());
        ecSalesRevenueService.updateById(rev);
        log.info("[EC收入] 核账确认 id={} revenueNo={}", id, rev.getRevenueNo());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. 入账（confirmed → reconciled）
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public void reconcile(Long id) {
        Long tenantId = com.fashion.supplychain.common.tenant.TenantAssert.requireTenantId();
        EcSalesRevenue rev = ecSalesRevenueService.getOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<EcSalesRevenue>()
                        .eq(EcSalesRevenue::getId, id)
                        .eq(EcSalesRevenue::getTenantId, tenantId));
        if (rev == null) throw new IllegalArgumentException("收入流水不存在: " + id);
        if (!"confirmed".equals(rev.getStatus())) {
            throw new IllegalStateException("仅 confirmed 状态可入账，当前状态=" + rev.getStatus());
        }
        checkTenant(rev.getTenantId());
        rev.setStatus("reconciled");
        rev.setCompleteTime(LocalDateTime.now());
        ecSalesRevenueService.updateById(rev);
        log.info("[EC收入] 已入账 id={} revenueNo={}", id, rev.getRevenueNo());

        // 入账后自动推送到账单汇总
        pushEcRevenueBill(rev);
    }

    private void pushEcRevenueBill(EcSalesRevenue rev) {
        try {
            BillAggregationOrchestrator.BillPushRequest req = new BillAggregationOrchestrator.BillPushRequest();
            req.setBillType("RECEIVABLE");
            req.setBillCategory("SHIPMENT");
            req.setSourceType("EC_SALES_REVENUE");
            req.setSourceId(String.valueOf(rev.getId()));
            req.setSourceNo(rev.getRevenueNo());
            req.setCounterpartyType("CUSTOMER");
            req.setCounterpartyName(rev.getPlatform());
            req.setOrderNo(rev.getEcOrderNo());
            req.setAmount(rev.getPayAmount());
            req.setRemark("EC销售收入入账: " + rev.getPlatform());
            billAggregationOrchestrator.pushBill(req);
        } catch (Exception e) {
            log.error("EC收入推送账单失败: no={}", rev.getRevenueNo(), e);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. 分页查询
    // ─────────────────────────────────────────────────────────────────────────

    public IPage<EcSalesRevenue> list(Map<String, Object> params) {
        int page     = parseIntSafe(params.get("page"), 1);
        int pageSize = parseIntSafe(params.get("pageSize"), 20);

        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<EcSalesRevenue> wrapper = new LambdaQueryWrapper<EcSalesRevenue>()
                .orderByDesc(EcSalesRevenue::getCreateTime);

        wrapper.eq(EcSalesRevenue::getTenantId, tenantId);

        String status = (String) params.get("status");
        if (StringUtils.hasText(status)) wrapper.eq(EcSalesRevenue::getStatus, status);

        String platform = (String) params.get("platform");
        if (StringUtils.hasText(platform)) wrapper.eq(EcSalesRevenue::getPlatform, platform);

        String keyword = (String) params.get("keyword");
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(EcSalesRevenue::getEcOrderNo, keyword)
                    .or().like(EcSalesRevenue::getPlatformOrderNo, keyword)
                    .or().like(EcSalesRevenue::getProductName, keyword));
        }

        return ecSalesRevenueService.page(new Page<>(page, pageSize), wrapper);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. 汇总统计（月度/平台维度）
    // ─────────────────────────────────────────────────────────────────────────

    public Map<String, Object> summary(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();

        // 不带 status 过滤，拉取全部数据用于分组统计
        LambdaQueryWrapper<EcSalesRevenue> baseWrapper = new LambdaQueryWrapper<EcSalesRevenue>();
        baseWrapper.eq(EcSalesRevenue::getTenantId, tenantId);

        String platform = (String) params.get("platform");
        if (StringUtils.hasText(platform)) baseWrapper.eq(EcSalesRevenue::getPlatform, platform);

        String startDate = (String) params.get("startDate");
        String endDate = (String) params.get("endDate");
        if (StringUtils.hasText(startDate)) baseWrapper.ge(EcSalesRevenue::getShipTime, startDate + " 00:00:00");
        if (StringUtils.hasText(endDate)) baseWrapper.le(EcSalesRevenue::getShipTime, endDate + " 23:59:59");

        baseWrapper.last("LIMIT 5000");
        java.util.List<EcSalesRevenue> all = ecSalesRevenueService.list(baseWrapper);

        // 按状态分组统计（前端 EcRevenueSummary 期望字段）
        java.util.Map<String, List<EcSalesRevenue>> byStatus = all.stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        r -> r.getStatus() != null ? r.getStatus() : "unknown"));

        List<EcSalesRevenue> pendingList     = byStatus.getOrDefault("pending",     java.util.Collections.emptyList());
        List<EcSalesRevenue> confirmedList   = byStatus.getOrDefault("confirmed",   java.util.Collections.emptyList());
        List<EcSalesRevenue> reconciledList  = byStatus.getOrDefault("reconciled",  java.util.Collections.emptyList());

        BigDecimal pendingAmount    = sumPayAmount(pendingList);
        BigDecimal confirmedAmount  = sumPayAmount(confirmedList);
        BigDecimal reconciledAmount = sumPayAmount(reconciledList);

        // 用于平台分组的数据（confirmed + reconciled，与之前行为一致）
        List<EcSalesRevenue> forBreakdown = new java.util.ArrayList<>();
        forBreakdown.addAll(confirmedList);
        forBreakdown.addAll(reconciledList);

        BigDecimal totalPayAmount = sumPayAmount(forBreakdown);
        BigDecimal totalFreight = forBreakdown.stream()
                .map(r -> r.getFreight() != null ? r.getFreight() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        int totalQuantity = forBreakdown.stream()
                .mapToInt(r -> r.getQuantity() != null ? r.getQuantity() : 0)
                .sum();

        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        // 前端 EcRevenueSummary 期望字段（向后兼容）
        result.put("pendingCount",     pendingList.size());
        result.put("pendingAmount",    pendingAmount);
        result.put("confirmedCount",   confirmedList.size());
        result.put("confirmedAmount",  confirmedAmount);
        result.put("reconciledCount",  reconciledList.size());
        result.put("reconciledAmount", reconciledAmount);
        result.put("netIncome",        reconciledAmount);
        // 新增字段（小程序 + PC端平台分组用）
        result.put("orderCount",       forBreakdown.size());
        result.put("totalQuantity",    totalQuantity);
        result.put("totalPayAmount",   totalPayAmount);
        result.put("totalFreight",     totalFreight);
        result.put("netRevenue",       totalPayAmount.subtract(totalFreight));
        result.put("platformBreakdown", buildPlatformBreakdown(forBreakdown));
        return result;
    }

    private BigDecimal sumPayAmount(List<EcSalesRevenue> list) {
        return list.stream()
                .map(r -> r.getPayAmount() != null ? r.getPayAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 内部工具
    // ─────────────────────────────────────────────────────────────────────────

    private List<Map<String, Object>> buildPlatformBreakdown(List<EcSalesRevenue> records) {
        Map<String, List<EcSalesRevenue>> grouped = records.stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        r -> r.getPlatform() != null ? r.getPlatform() : "UNKNOWN"));
        return grouped.entrySet().stream()
                .map(e -> {
                    List<EcSalesRevenue> list = e.getValue();
                    BigDecimal payAmount = list.stream()
                            .map(r -> r.getPayAmount() != null ? r.getPayAmount() : BigDecimal.ZERO)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    BigDecimal freight = list.stream()
                            .map(r -> r.getFreight() != null ? r.getFreight() : BigDecimal.ZERO)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    int quantity = list.stream()
                            .mapToInt(r -> r.getQuantity() != null ? r.getQuantity() : 0)
                            .sum();
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("platform", e.getKey());
                    m.put("orderCount", list.size());
                    m.put("totalQuantity", quantity);
                    m.put("totalPayAmount", payAmount);
                    m.put("totalFreight", freight);
                    m.put("netRevenue", payAmount.subtract(freight));
                    return m;
                })
                .sorted((a, b) -> ((BigDecimal) b.get("totalPayAmount")).compareTo((BigDecimal) a.get("totalPayAmount")))
                .collect(java.util.stream.Collectors.toList());
    }

    private String genRevenueNo(String platform) {
        String p = platform != null ? platform : "EC";
        return "REV-" + p + "-" + LocalDateTime.now().format(DATE_FMT)
                + "-" + (System.currentTimeMillis() % 100000);
    }

    private void checkTenant(Long recordTenantId) {
        com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(recordTenantId, "收入记录");
    }

    private int parseIntSafe(Object v, int def) {
        if (v == null) return def;
        try { return Integer.parseInt(v.toString()); } catch (Exception e) { return def; }
    }
}
