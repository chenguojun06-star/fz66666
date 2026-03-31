package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.orchestration.EcSalesRevenueOrchestrator;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.integration.ecommerce.service.PlatformNotifyService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * 电商平台订单编排器（第58号）
 *
 * 数据流说明：
 *   电商平台(淘宝/京东/抖音...)
 *       ↓ 发货单/销售单 [Webhook POST /api/ecommerce/webhook/{platform} 或 手动导入]
 *   t_ecommerce_order (本表存储)
 *       ↓ 关联（手动点击"关联排产" 或 自动按 orderNo 匹配）
 *   t_production_order (生产模块)
 *       ↓ 生产完成 → 质检入库 → 仓库出库
 *   FinishedInventoryOrchestrator.outbound()
 *       ↓ [触发本编排器] onWarehouseOutbound()
 *   回写 t_ecommerce_order.warehouse_status=2 + tracking_no
 *       ↓ (未来) 调用平台 API 回传物流信息
 */
@Slf4j
@Service
public class EcommerceOrderOrchestrator {

    @Autowired
    private EcommerceOrderService ecOrderService;

    @Autowired
    private EcSalesRevenueOrchestrator ecSalesRevenueOrchestrator;

    @Autowired
    private PlatformNotifyService platformNotifyService;

    @Autowired
    private ProductionOrderService productionOrderService;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. 接收平台订单（Webhook 入口，幂等）
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> receiveOrder(String platformCode, Map<String, Object> body) {
        String platformOrderNo = (String) body.getOrDefault("platformOrderNo", body.get("tid"));
        if (!StringUtils.hasText(platformOrderNo)) {
            throw new IllegalArgumentException("平台订单号不能为空 (platformOrderNo)");
        }

        // 幂等：已存在则返回现有记录 ID
        Long tenantId = null;
        try { tenantId = UserContext.tenantId(); } catch (Exception ignored) {}

        LambdaQueryWrapper<EcommerceOrder> exist = new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getPlatformOrderNo, platformOrderNo)
                .eq(EcommerceOrder::getSourcePlatformCode, platformCode);
        if (tenantId != null) exist.eq(EcommerceOrder::getTenantId, tenantId);
        EcommerceOrder found = ecOrderService.getOne(exist, false);
        if (found != null) {
            return Map.of("id", found.getId(), "orderNo", found.getOrderNo(), "duplicate", true);
        }

        EcommerceOrder order = new EcommerceOrder();
        order.setSourcePlatformCode(platformCode);
        order.setPlatformOrderNo(platformOrderNo);
        order.setPlatform(toPlatformAbbr(platformCode));
        order.setShopName((String) body.get("shopName"));
        order.setBuyerNick((String) body.get("buyerNick"));
        order.setProductName((String) body.get("productName"));
        order.setSkuCode((String) body.get("skuCode"));
        order.setReceiverName((String) body.get("receiverName"));
        order.setReceiverPhone((String) body.get("receiverPhone"));
        order.setReceiverAddress((String) body.get("receiverAddress"));
        order.setBuyerRemark((String) body.get("buyerRemark"));
        order.setQuantity(parseIntSafe(body.get("quantity"), 1));
        order.setStatus(1); // 待发货
        order.setWarehouseStatus(0); // 待拣货
        order.setTenantId(tenantId);
        order.setOrderNo(genOrderNo(platformCode));

        // 金额字段（完整解析所有平台可能推送的金额字段）
        if (body.get("unitPrice") != null) {
            order.setUnitPrice(new java.math.BigDecimal(body.get("unitPrice").toString()));
        }
        if (body.get("totalAmount") != null) {
            order.setTotalAmount(new java.math.BigDecimal(body.get("totalAmount").toString()));
        }
        if (body.get("payAmount") != null) {
            order.setPayAmount(new java.math.BigDecimal(body.get("payAmount").toString()));
        }
        if (body.get("freight") != null) {
            order.setFreight(new java.math.BigDecimal(body.get("freight").toString()));
        }
        if (body.get("discount") != null) {
            order.setDiscount(new java.math.BigDecimal(body.get("discount").toString()));
        }
        order.setPayType((String) body.get("payType"));
        ecOrderService.save(order);
        log.info("[EC接入] 平台={} 平台单号={} 内部单号={}", platformCode, platformOrderNo, order.getOrderNo());

        // ── SKU 自动匹配生产订单（静默，不阻断接单）─────────────
        try {
            if (StringUtils.hasText(order.getSkuCode())) {
                // skuCode 格式: "styleNo-颜色-尺码"，取首个"-"前为款号
                String styleNo = order.getSkuCode().split("-")[0];
                if (StringUtils.hasText(styleNo)) {
                    ProductionOrder matched = productionOrderService.getOne(
                            new LambdaQueryWrapper<ProductionOrder>()
                                    .eq(ProductionOrder::getStyleNo, styleNo)
                                    .ne(ProductionOrder::getStatus, "completed")
                                    .eq(ProductionOrder::getDeleteFlag, 0)
                                    .orderByAsc(ProductionOrder::getCreateTime)
                                    .last("LIMIT 1"), false);
                    if (matched != null) {
                        order.setProductionOrderNo(matched.getOrderNo());
                        order.setWarehouseStatus(1); // 备货中
                        ecOrderService.updateById(order);
                        log.info("[EC自动匹配] EC单={} 关联生产单={} styleNo={}",
                                order.getOrderNo(), matched.getOrderNo(), styleNo);
                    } else {
                        log.info("[EC自动匹配] 未找到可匹配生产单 skuCode={} styleNo={}",
                                order.getSkuCode(), styleNo);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[EC自动匹配] SKU匹配异常，不阻断接单: {}", e.getMessage());
        }
        // ────────────────────────────────────────────────────────

        return Map.of("id", order.getId(), "orderNo", order.getOrderNo(), "duplicate", false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. 查询列表（带分页、平台、状态筛选）
    // ─────────────────────────────────────────────────────────────────────────

    public IPage<EcommerceOrder> listOrders(Map<String, Object> params) {
        int page = parseIntSafe(params.get("page"), 1);
        int pageSize = parseIntSafe(params.get("pageSize"), 20);
        LambdaQueryWrapper<EcommerceOrder> wrapper = new LambdaQueryWrapper<EcommerceOrder>()
                .orderByDesc(EcommerceOrder::getCreateTime);

        Long tenantId = null;
        try { tenantId = UserContext.tenantId(); } catch (Exception ignored) {}
        if (tenantId != null) wrapper.eq(EcommerceOrder::getTenantId, tenantId);

        String platform = (String) params.get("platform");
        if (StringUtils.hasText(platform)) wrapper.eq(EcommerceOrder::getSourcePlatformCode, platform);

        Object status = params.get("status");
        if (status != null) wrapper.eq(EcommerceOrder::getStatus, parseIntSafe(status, -1));

        String keyword = (String) params.get("keyword");
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(EcommerceOrder::getPlatformOrderNo, keyword)
                    .or().like(EcommerceOrder::getOrderNo, keyword)
                    .or().like(EcommerceOrder::getBuyerNick, keyword)
                    .or().like(EcommerceOrder::getReceiverName, keyword));
        }
        return ecOrderService.page(new Page<>(page, pageSize), wrapper);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. 手动关联生产订单
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public void linkProductionOrder(Long ecOrderId, String productionOrderNo) {
        EcommerceOrder order = ecOrderService.getById(ecOrderId);
        if (order == null) throw new IllegalArgumentException("电商订单不存在: " + ecOrderId);
        order.setProductionOrderNo(productionOrderNo);
        order.setWarehouseStatus(1); // 备货中
        ecOrderService.updateById(order);
        log.info("[EC关联] EC订单={} 关联生产订单={}", order.getOrderNo(), productionOrderNo);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. 现货直接出库（无需生产订单，由前端操作触发）
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public void directOutbound(Long ecOrderId, String trackingNo, String expressCompany) {
        EcommerceOrder order = ecOrderService.getById(ecOrderId);
        if (order == null) throw new IllegalArgumentException("电商订单不存在: " + ecOrderId);
        if (order.getWarehouseStatus() != null && order.getWarehouseStatus() >= 2) {
            throw new IllegalStateException("订单已出库，无需重复操作");
        }
        order.setStatus(2); // 已发货
        order.setWarehouseStatus(2); // 已出库
        order.setTrackingNo(trackingNo);
        order.setExpressCompany(expressCompany);
        order.setShipTime(LocalDateTime.now());
        ecOrderService.updateById(order);
        log.info("[EC现货出库] EC单号={} 快递公司={} 快递单号={}", order.getOrderNo(), expressCompany, trackingNo);
        // 自动生成销售收入流水（失败不阻断出库）
        try {
            ecSalesRevenueOrchestrator.recordOnOutbound(order);
        } catch (Exception e) {
            log.warn("[EC现货出库] 收入流水记录失败，不阻断出库: {}", e.getMessage());
        }
        // 回传平台物流信息（失败不阻断出库）
        try {
            platformNotifyService.notifyShipped(order);
        } catch (Exception e) {
            log.warn("[EC现货出库] 物流回传失败: {}", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. 仓库出库后回写物流信息（由 FinishedInventoryOrchestrator 调用）
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public void onWarehouseOutbound(String productionOrderNo, String trackingNo, String expressCompany) {
        if (!StringUtils.hasText(productionOrderNo)) return;
        LambdaQueryWrapper<EcommerceOrder> wrapper = new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getProductionOrderNo, productionOrderNo)
                .in(EcommerceOrder::getStatus, 1, 2); // 待发货或已发货
        EcommerceOrder order = ecOrderService.getOne(wrapper, false);
        if (order == null) return;
        order.setStatus(2); // 已发货
        order.setWarehouseStatus(2); // 已出库
        order.setTrackingNo(trackingNo);
        order.setExpressCompany(expressCompany);
        order.setShipTime(LocalDateTime.now());
        ecOrderService.updateById(order);
        log.info("[EC出库回写] 生产单={} 快递单号={} EC订单={}", productionOrderNo, trackingNo, order.getOrderNo());
        // 自动生成销售收入流水（失败不阻断出库）
        try {
            ecSalesRevenueOrchestrator.recordOnOutbound(order);
        } catch (Exception e) {
            log.warn("[EC出库回写] 收入流水记录失败，不阻断出库: {}", e.getMessage());
        }
        // 回传平台物流信息（失败不阻断出库）
        try {
            platformNotifyService.notifyShipped(order);
        } catch (Exception e) {
            log.warn("[EC出库回写] 物流回传失败: {}", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 内部工具
    // ─────────────────────────────────────────────────────────────────────────

    private String genOrderNo(String platformCode) {
        String prefix = switch (platformCode) {
            case "TAOBAO" -> "TB";
            case "TMALL" -> "TM";
            case "JD" -> "JD";
            case "DOUYIN" -> "DY";
            case "PINDUODUO" -> "PDD";
            case "XIAOHONGSHU" -> "XHS";
            case "WECHAT_SHOP" -> "WC";
            case "SHOPIFY" -> "SFY";
            default -> "EC";
        };
        return prefix + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyMMddHHmmssSSS"));
    }

    private String toPlatformAbbr(String code) {
        return switch (code) {
            case "TAOBAO" -> "TB";
            case "TMALL" -> "TM";
            case "JD" -> "JD";
            case "DOUYIN" -> "DY";
            case "PINDUODUO" -> "PDD";
            case "XIAOHONGSHU" -> "XHS";
            case "WECHAT_SHOP" -> "WC";
            case "SHOPIFY" -> "SFY";
            default -> code;
        };
    }

    private int parseIntSafe(Object val, int defaultVal) {
        if (val == null) return defaultVal;
        try { return Integer.parseInt(val.toString()); } catch (Exception e) { return defaultVal; }
    }
}
