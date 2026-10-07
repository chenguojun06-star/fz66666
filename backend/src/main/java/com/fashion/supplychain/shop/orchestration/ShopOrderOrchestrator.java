package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.orchestration.CustomerOrchestrator;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.shop.entity.ShopConfig;
import com.fashion.supplychain.shop.entity.ShopOrder;
import com.fashion.supplychain.shop.entity.ShopOrderItem;
import com.fashion.supplychain.shop.mapper.ShopConfigMapper;
import com.fashion.supplychain.shop.mapper.ShopOrderItemMapper;
import com.fashion.supplychain.shop.mapper.ShopOrderMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.warehouse.orchestration.FinishedWarehouseOperationOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

/**
 * C端店铺下单编排器（D-763 一期核心）。
 *
 * <p>全链：游客下单（slug 定位租户）→ 服务端算价/校验库存 → 每款走 freeOutbound
 * 扣库存+落出库台账 → 按手机号归并 CRM 客户 → 挂账应收（收款走收付款中心，
 * 发票草稿由应收确认自动联动）→ 落店铺订单。价格/库存永远以服务端为准，不信前端。</p>
 *
 * <p>公开接口无 UserContext：内部以「system 身份 + slug 租户」构造上下文执行
 * 既有编排器（与巡检 Job 的 withTenantContext 同一模式），结束恢复原上下文。</p>
 */
@Slf4j
@Service
public class ShopOrderOrchestrator {

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final AtomicInteger NO_SEQ = new AtomicInteger(0);

    @Autowired
    private ShopConfigMapper shopConfigMapper;

    @Autowired
    private ShopOrderMapper shopOrderMapper;

    @Autowired
    private ShopOrderItemMapper shopOrderItemMapper;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private FinishedWarehouseOperationOrchestrator finishedWarehouseOperationOrchestrator;

    @Autowired
    private CustomerOrchestrator customerOrchestrator;

    @Autowired
    private ReceivableOrchestrator receivableOrchestrator;

    /** slug → 店铺配置（打烊时浏览可见但下单被拒） */
    public ShopConfig resolveBySlug(String slug) {
        if (!StringUtils.hasText(slug)) {
            return null;
        }
        return shopConfigMapper.selectOne(new LambdaQueryWrapper<ShopConfig>()
                .eq(ShopConfig::getSlug, slug)
                .last("LIMIT 1"));
    }

    /** 买家按手机号查自己店铺内的订单（slug 版，控制器薄壳直用；脱敏展示由 Controller 负责） */
    public List<ShopOrder> ordersByPhone(String slug, String phone) {
        ShopConfig config = resolveBySlug(slug);
        if (config == null) {
            throw new IllegalArgumentException("店铺不存在");
        }
        return ordersByPhone(config.getTenantId(), phone);
    }

    /** 买家按手机号查自己店铺内的订单（脱敏展示由 Controller 负责） */
    public List<ShopOrder> ordersByPhone(Long tenantId, String phone) {
        if (!StringUtils.hasText(phone)) {
            return List.of();
        }
        return shopOrderMapper.selectList(new LambdaQueryWrapper<ShopOrder>()
                .eq(ShopOrder::getTenantId, tenantId)
                .eq(ShopOrder::getPhone, phone.trim())
                .eq(ShopOrder::getDeleteFlag, 0)
                .orderByDesc(ShopOrder::getCreateTime)
                .last("LIMIT 50"));
    }

    // ── 店铺浏览（D-763，控制器薄壳化后由编排器供数据） ─────────────────────

    public Map<String, Object> shopInfo(String slug) {
        ShopConfig config = resolveBySlug(slug);
        if (config == null) {
            throw new IllegalArgumentException("店铺不存在");
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("shopName", config.getShopName());
        data.put("notice", config.getNotice());
        data.put("enabled", Integer.valueOf(1).equals(config.getEnabled()));
        return data;
    }

    public Map<String, Object> listProducts(String slug, int page, int pageSize, String keyword) {
        ShopConfig config = resolveBySlug(slug);
        if (config == null) {
            throw new IllegalArgumentException("店铺不存在");
        }
        Page<com.fashion.supplychain.style.entity.StyleInfo> p = styleInfoService.page(
                new Page<>(page, pageSize),
                new LambdaQueryWrapper<com.fashion.supplychain.style.entity.StyleInfo>()
                        .eq(com.fashion.supplychain.style.entity.StyleInfo::getTenantId, config.getTenantId())
                        .eq(com.fashion.supplychain.style.entity.StyleInfo::getShopListed, 1)
                        .and(StringUtils.hasText(keyword), w -> w
                                .like(com.fashion.supplychain.style.entity.StyleInfo::getStyleName, keyword)
                                .or().like(com.fashion.supplychain.style.entity.StyleInfo::getStyleNo, keyword))
                        .orderByDesc(com.fashion.supplychain.style.entity.StyleInfo::getShopListingTime));

        List<Long> styleIds = p.getRecords().stream()
                .map(com.fashion.supplychain.style.entity.StyleInfo::getId)
                .collect(Collectors.toList());
        Map<Long, List<ProductSku>> skusByStyle = groupSkus(config.getTenantId(), styleIds);

        List<Map<String, Object>> rows = new ArrayList<>();
        for (com.fashion.supplychain.style.entity.StyleInfo s : p.getRecords()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("styleId", s.getId());
            row.put("styleNo", s.getStyleNo());
            row.put("styleName", s.getStyleName());
            row.put("cover", s.getCover());
            List<ProductSku> skus = skusByStyle.getOrDefault(s.getId(), List.of());
            row.put("minPrice", skus.stream()
                    .map(ProductSku::getSalesPrice)
                    .filter(java.util.Objects::nonNull)
                    .reduce(java.math.BigDecimal::min)
                    .orElse(null));
            row.put("totalStock", skus.stream()
                    .mapToInt(k -> k.getStockQuantity() == null ? 0 : k.getStockQuantity())
                    .sum());
            row.put("colorCount", skus.stream().map(ProductSku::getColor).collect(Collectors.toSet()).size());
            rows.add(row);
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("records", rows);
        resp.put("total", p.getTotal());
        return resp;
    }

    public Map<String, Object> productDetail(String slug, Long styleId) {
        ShopConfig config = resolveBySlug(slug);
        if (config == null) {
            throw new IllegalArgumentException("店铺不存在");
        }
        com.fashion.supplychain.style.entity.StyleInfo style = styleInfoService.getById(styleId);
        if (style == null || !config.getTenantId().equals(style.getTenantId())
                || style.getShopListed() == null || style.getShopListed() != 1) {
            throw new IllegalArgumentException("商品不存在或已下架");
        }
        List<ProductSku> skus = productSkuService.list(new LambdaQueryWrapper<ProductSku>()
                .eq(ProductSku::getStyleId, styleId)
                .eq(ProductSku::getTenantId, config.getTenantId()));
        List<Map<String, Object>> skuRows = skus.stream().map(k -> {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("skuId", k.getId());
            r.put("color", k.getColor());
            r.put("size", k.getSize());
            r.put("price", k.getSalesPrice());
            r.put("stock", k.getStockQuantity() == null ? 0 : k.getStockQuantity());
            // D-768：该 SKU（款号+颜色）的图片，供 C 端选颜色时切换主图
            r.put("image", k.getSkuColorImage());
            return r;
        }).collect(Collectors.toList());

        // D-768：颜色 → 图片 映射（每色取第一条非空），H5 直接取用，省二次聚合
        Map<String, String> colorImages = new LinkedHashMap<>();
        for (ProductSku k : skus) {
            String color = k.getColor();
            if (StringUtils.hasText(color) && StringUtils.hasText(k.getSkuColorImage())
                    && !colorImages.containsKey(color)) {
                colorImages.put(color, k.getSkuColorImage());
            }
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("styleId", style.getId());
        data.put("styleNo", style.getStyleNo());
        data.put("styleName", style.getStyleName());
        data.put("cover", style.getCover());
        data.put("remark", style.getRemark());
        data.put("skus", skuRows);
        data.put("colorImages", colorImages);
        return data;
    }

    private Map<Long, List<ProductSku>> groupSkus(Long tenantId, List<Long> styleIds) {
        if (styleIds.isEmpty()) {
            return Map.of();
        }
        return productSkuService.list(new LambdaQueryWrapper<ProductSku>()
                        .in(ProductSku::getStyleId, styleIds)
                        .eq(ProductSku::getTenantId, tenantId))
                .stream()
                .filter(k -> k.getStyleId() != null)
                .collect(Collectors.groupingBy(ProductSku::getStyleId));
    }

    /**
     * 店铺下单全链。整体一个事务：出库/应收/订单要么全成要么全不成。
     *
     * @param items skuId + quantity（价格前端不传）
     */
    @Transactional(rollbackFor = Exception.class)
    public ShopOrder placeOrder(String slug, String customerName, String phone,
                                String address, String remark,
                                List<Map<String, Object>> items) {
        ShopConfig config = resolveBySlug(slug);
        if (config == null) {
            throw new IllegalArgumentException("店铺不存在");
        }
        if (config.getEnabled() == null || config.getEnabled() != 1) {
            throw new IllegalArgumentException("店铺已打烊，暂时无法下单");
        }
        if (!StringUtils.hasText(customerName) || !StringUtils.hasText(phone) || !StringUtils.hasText(address)) {
            throw new IllegalArgumentException("请填写收货人、联系电话和收货地址");
        }
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("购物车为空");
        }

        return runAsTenant(config.getTenantId(), () -> doPlaceOrder(config, customerName, phone, address, remark, items));
    }

    private ShopOrder doPlaceOrder(ShopConfig config, String customerName, String phone,
                                   String address, String remark,
                                   List<Map<String, Object>> items) {
        Long tenantId = config.getTenantId();

        // 1. 逐项校验：SKU 存在、款式已上架、库存充足；金额服务端计算
        List<ShopOrderItem> orderItems = new ArrayList<>();
        for (Map<String, Object> item : items) {
            Object skuIdObj = item.get("skuId");
            int qty = parseInt(item.get("quantity"));
            if (skuIdObj == null || qty <= 0) {
                throw new IllegalArgumentException("商品明细不合法（缺 skuId 或数量≤0）");
            }
            ProductSku sku = productSkuService.getById(String.valueOf(skuIdObj));
            if (sku == null || !tenantId.equals(sku.getTenantId())) {
                throw new IllegalArgumentException("商品不存在或已下架");
            }
            StyleInfo style = sku.getStyleId() != null ? styleInfoService.getById(sku.getStyleId()) : null;
            if (style == null || style.getShopListed() == null || style.getShopListed() != 1) {
                throw new IllegalArgumentException("商品「" + sku.getStyleNo() + "」已下架");
            }
            int stock = sku.getStockQuantity() == null ? 0 : sku.getStockQuantity();
            if (stock < qty) {
                throw new IllegalArgumentException("「" + style.getStyleName() + " "
                        + sku.getColor() + " " + sku.getSize() + "」库存不足（仅剩 " + stock + " 件）");
            }
            BigDecimal price = sku.getSalesPrice() == null ? BigDecimal.ZERO : sku.getSalesPrice();

            ShopOrderItem oi = new ShopOrderItem();
            oi.setSkuId(sku.getId());
            oi.setSkuCode(sku.getSkuCode());
            oi.setStyleNo(sku.getStyleNo());
            oi.setStyleName(style.getStyleName());
            oi.setColor(sku.getColor());
            oi.setSize(sku.getSize());
            oi.setUnitPrice(price);
            oi.setQuantity(qty);
            oi.setAmount(price.multiply(BigDecimal.valueOf(qty)).setScale(2, java.math.RoundingMode.HALF_UP));
            orderItems.add(oi);
        }
        BigDecimal total = orderItems.stream()
                .map(ShopOrderItem::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, java.math.RoundingMode.HALF_UP);
        int itemCount = orderItems.stream().mapToInt(ShopOrderItem::getQuantity).sum();

        // 2. 客户按手机号归并（无则新建），订单与应收都挂它
        Customer customer = findOrCreateCustomer(tenantId, customerName, phone);

        // 3. 落店铺订单主记录
        ShopOrder order = new ShopOrder();
        order.setOrderNo("SH" + LocalDateTime.now().format(NO_FMT)
                + String.format("%02d", NO_SEQ.incrementAndGet() % 100));
        order.setTenantId(tenantId);
        order.setCustomerId(customer.getId());
        order.setCustomerName(customerName);
        order.setPhone(phone);
        order.setAddress(address);
        order.setTotalAmount(total);
        order.setItemCount(itemCount);
        order.setStatus("PENDING_SHIP");
        order.setRemark(StringUtils.hasText(remark) ? remark : null);
        order.setDeleteFlag(0);
        order.setCreateTime(LocalDateTime.now());
        order.setUpdateTime(LocalDateTime.now());
        shopOrderMapper.insert(order);

        // 4. 逐款出库：扣 SKU 库存 + 落 t_product_outstock 台账（与仓库页自由出库同一正路）
        List<String> outstockNos = new ArrayList<>();
        for (ShopOrderItem oi : orderItems) {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("skuCode", oi.getSkuCode());
            params.put("quantity", oi.getQuantity());
            params.put("outstockType", "free_outbound");
            params.put("customerName", customerName);
            params.put("customerPhone", phone);
            params.put("shippingAddress", address);
            params.put("remark", "店铺订单 " + order.getOrderNo());
            var out = freeOutboundCapturingNo(params);
            if (out != null && StringUtils.hasText(out.getOutstockNo())) {
                outstockNos.add(out.getOutstockNo());
            }
            oi.setOrderId(order.getId());
            oi.setTenantId(tenantId);
            shopOrderItemMapper.insert(oi);
        }
        if (!outstockNos.isEmpty()) {
            order.setOutstockNo(outstockNos.get(0) + (outstockNos.size() > 1 ? " 等" + outstockNos.size() + "单" : ""));
            ShopOrder patch = new ShopOrder();
            patch.setId(order.getId());
            patch.setOutstockNo(order.getOutstockNo());
            shopOrderMapper.updateById(patch);
        }

        // 5. 挂账应收（收款走收付款中心；发票草稿由应收创建自动联动——D-753）
        Receivable receivable = new Receivable();
        receivable.setCustomerId(customer.getId());
        receivable.setCustomerName(customer.getCompanyName());
        receivable.setAmount(total);
        receivable.setDescription("店铺订单 " + order.getOrderNo());
        Receivable saved = receivableOrchestrator.create(receivable);
        ShopOrder patch2 = new ShopOrder();
        patch2.setId(order.getId());
        patch2.setReceivableId(saved.getId());
        shopOrderMapper.updateById(patch2);
        order.setReceivableId(saved.getId());

        log.info("[ShopOrder] 店铺下单成功 orderNo={} tenant={} 金额={} 明细={}款 出库={}单 应收={}",
                order.getOrderNo(), tenantId, total, orderItems.size(), outstockNos.size(), saved.getReceivableNo());
        return order;
    }

    // ── 内部 ────────────────────────────────────────────────────────────────

    private Customer findOrCreateCustomer(Long tenantId, String customerName, String phone) {
        Customer existing = customerOrchestrator.getByPhone(tenantId, phone);
        if (existing != null) {
            return existing;
        }
        Customer c = new Customer();
        c.setCompanyName(customerName + "（店铺客户）");
        c.setContactPerson(customerName);
        c.setContactPhone(phone);
        c.setSource("SHOP");
        c.setCustomerLevel("3");
        return customerOrchestrator.save(c);
    }

    private com.fashion.supplychain.production.entity.ProductOutstock freeOutboundCapturingNo(Map<String, Object> params) {
        return finishedWarehouseOperationOrchestrator.freeOutbound(params);
    }

    private int parseInt(Object v) {
        if (v == null) return 0;
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (Exception e) {
            return 0;
        }
    }

    /** 以 system 身份构造租户上下文执行（公开接口无 UserContext），结束恢复 */
    private <T> T runAsTenant(Long tenantId, java.util.function.Supplier<T> action) {
        UserContext previous = UserContext.get();
        try {
            UserContext ctx = new UserContext();
            ctx.setTenantId(tenantId);
            ctx.setUserId("shop");
            ctx.setUsername("shop");
            UserContext.set(ctx);
            return action.get();
        } finally {
            if (previous != null) {
                UserContext.set(previous);
            } else {
                UserContext.clear();
            }
        }
    }
}
