package com.fashion.supplychain.pos.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.orchestration.CustomerOrchestrator;
import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.orchestration.PaymentOrchestrator;
import com.fashion.supplychain.pos.entity.PosSale;
import com.fashion.supplychain.pos.entity.PosSaleItem;
import com.fashion.supplychain.pos.mapper.PosSaleItemMapper;
import com.fashion.supplychain.pos.mapper.PosSaleMapper;
import com.fashion.supplychain.pos.service.PosSaleWriteService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

/**
 * 收银台（POS 开单）编排。
 *
 * <p><b>为什么能做得很轻</b>：商品/SKU、成品库存、出库台账、应收账款、收付款中心、
 * 客户档案在系统里都已经有了。缺的只有「一屏完成选货 → 改价 → 收款」的单据，
 * 所以这里**不新建任何库存/财务逻辑**，只做编排：
 * <ul>
 *   <li>出库：逐 SKU 走既有的 {@code freeOutbound}（扣库存 + 落 t_product_outstock 台账）；</li>
 *   <li>收款：现金/刷卡当场收（登记方式）；挂账生成应收单进「收付款中心」核销；
 *       <b>微信/支付宝走真实支付通道</b>（顾客扫屏幕二维码，渠道确认后才出库）；</li>
 * </ul>
 *
 * <p><b>资金合规</b>：在线收款用的是**商家自己的商户号**（在「收款设置」里配置），
 * 平台不经手资金。平台用一个商户号代收所有商家的钱属于二清（无牌照非法经营）。
 *
 * <p><b>出库时机</b>：只有"钱到位"才出库 —— 现金/刷卡当场、挂账记账、
 * 在线支付等渠道确认（回调或轮询）。待支付中的单只是占位，不动库存。
 *
 * <p><b>金额一律服务端算</b>，前端只传单价、数量、折扣、抹零这些原始输入。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PosSaleOrchestrator {

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final AtomicInteger NO_SEQ = new AtomicInteger(0);

    /** 收款方式白名单：前四种是登记式，后两种走真实支付通道 */
    private static final Set<String> PAY_METHODS = new LinkedHashSet<>(
            List.of("CASH", "WECHAT", "ALIPAY", "CARD", "CREDIT"));
    /** 走真实支付通道的收款方式 */
    private static final Set<String> PAY_ONLINE = Set.of("WECHAT", "ALIPAY");
    private static final String PAY_CREDIT = "CREDIT";
    private static final int MAX_QTY = 9999;
    private static final int MAX_LINES = 200;
    private static final int MAX_SEARCH = 60;

    private final PosSaleMapper saleMapper;
    private final PosSaleItemMapper saleItemMapper;
    private final ProductSkuService productSkuService;
    private final StyleInfoService styleInfoService;
    private final CustomerOrchestrator customerOrchestrator;
    private final PosSaleWriteService writeService;
    private final PaymentOrchestrator paymentOrchestrator;

    /* ── 选货 ─────────────────────────────────────────────────────────────── */

    /**
     * 扫码 / 关键字找货。
     *
     * <p>扫码枪就是键盘：输入条码/款号后回车。所以**精确命中（条码或 SKU 编码）排最前**，
     * 模糊命中排后面 —— 扫「ABC123」却把「ABC1234」排第一会让收银员每次都选错。
     */
    public List<Map<String, Object>> searchSkus(String keyword, int limit) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null || !StringUtils.hasText(keyword)) {
            return List.of();
        }
        String kw = keyword.trim();
        int size = Math.min(Math.max(1, limit), MAX_SEARCH);

        // 款名匹配要先落到款式 ID 上（SKU 表没有款名）
        List<Long> styleIds = styleInfoService.list(new LambdaQueryWrapper<StyleInfo>()
                        .eq(StyleInfo::getTenantId, tenantId)
                        .like(StyleInfo::getStyleName, kw)
                        .last("LIMIT 50"))
                .stream().map(StyleInfo::getId).collect(Collectors.toList());

        List<ProductSku> skus = productSkuService.list(new LambdaQueryWrapper<ProductSku>()
                .eq(ProductSku::getTenantId, tenantId)
                .and(w -> {
                    w.like(ProductSku::getSkuCode, kw)
                            .or().like(ProductSku::getBarcode, kw)
                            .or().like(ProductSku::getStyleNo, kw);
                    if (!styleIds.isEmpty()) {
                        w.or().in(ProductSku::getStyleId, styleIds);
                    }
                })
                .last("LIMIT " + size));

        // 款名/封面（一次查全，避免逐行 N+1）
        Set<Long> ids = skus.stream().map(ProductSku::getStyleId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, StyleInfo> styleMap = ids.isEmpty() ? Map.of()
                : styleInfoService.listByIds(ids).stream()
                        .collect(Collectors.toMap(StyleInfo::getId, s -> s));

        String upper = kw.toUpperCase();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (ProductSku k : skus) {
            StyleInfo st = styleMap.get(k.getStyleId());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("skuId", k.getId());
            row.put("skuCode", k.getSkuCode());
            row.put("barcode", k.getBarcode());
            row.put("styleId", k.getStyleId());
            row.put("styleNo", k.getStyleNo() != null ? k.getStyleNo()
                    : (st == null ? null : st.getStyleNo()));
            row.put("styleName", st == null ? null : st.getStyleName());
            row.put("cover", st == null ? null : st.getCover());
            row.put("color", k.getColor());
            row.put("size", k.getSize());
            row.put("tagPrice", k.getTagPrice());
            row.put("salesPrice", k.getSalesPrice());
            row.put("stock", k.getStockQuantity() == null ? 0 : k.getStockQuantity());
            // 扫码精确命中优先：收银台最怕「扫了 A 却加进 B」
            row.put("_exact", exactMatch(k, upper) ? 0 : 1);
            rows.add(row);
        }
        rows.sort((a, b) -> {
            int c = Integer.compare((int) a.get("_exact"), (int) b.get("_exact"));
            if (c != 0) {
                return c;
            }
            return String.valueOf(a.get("skuCode")).compareTo(String.valueOf(b.get("skuCode")));
        });
        rows.forEach(r -> r.remove("_exact"));
        return rows;
    }

    private static boolean exactMatch(ProductSku k, String upper) {
        return upper.equalsIgnoreCase(safe(k.getBarcode())) || upper.equalsIgnoreCase(safe(k.getSkuCode()));
    }

    /* ── 客户 ─────────────────────────────────────────────────────────────── */

    /**
     * 按手机号带出客户与「上次成交价」。
     *
     * <p>批发档口最需要这个：同一个客户上次拿的什么价，是这次报价的基准。
     */
    public Map<String, Object> customer(String phone) {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("phone", phone);
        if (tenantId == null || !StringUtils.hasText(phone)) {
            return out;
        }
        String p = phone.trim();
        Customer c = customerOrchestrator.getByPhone(tenantId, p);
        if (c != null) {
            out.put("customerId", c.getId());
            out.put("customerName", StringUtils.hasText(c.getCompanyName())
                    ? c.getCompanyName() : c.getContactPerson());
        }
        // 上次成交价：同一 SKU 取最近一次（列表按时间倒序，首次出现即最新）
        Map<String, Object> lastPrices = new LinkedHashMap<>();
        for (Map<String, Object> row : saleMapper.customerRecentPrices(tenantId, p)) {
            Object skuId = row.get("skuId");
            if (skuId == null) {
                continue;
            }
            String key = String.valueOf(skuId);
            if (!lastPrices.containsKey(key)) {
                lastPrices.put(key, row.get("unitPrice"));
            }
        }
        out.put("lastPrices", lastPrices);
        return out;
    }

    /* ── 开单 ─────────────────────────────────────────────────────────────── */

    /**
     * 收银台开单：算价 → 校验库存 → 落单 → 按收款方式结算或发起在线支付。
     *
     * <p>本方法**刻意不加 @Transactional**：在线支付要在中间调渠道 HTTP 接口，
     * 事务里做网络调用会长时间占着数据库连接。事务边界交给
     * {@link PosSaleWriteService#createSale} 与 {@link PosSaleWriteService#settle}。
     *
     * @param body items[{skuId,quantity,unitPrice?}] / payMethod / discount / roundOff /
     *             customerName / customerPhone / remark
     */
    public Map<String, Object> checkout(Map<String, Object> body) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalArgumentException("请先登录");
        }
        List<Map<String, Object>> rawItems = asList(body.get("items"));
        if (rawItems.isEmpty()) {
            throw new IllegalArgumentException("请先添加商品");
        }
        if (rawItems.size() > MAX_LINES) {
            throw new IllegalArgumentException("一单最多 " + MAX_LINES + " 种商品");
        }
        String payMethod = StringUtils.hasText(str(body.get("payMethod")))
                ? str(body.get("payMethod")).toUpperCase() : "CASH";
        if (!PAY_METHODS.contains(payMethod)) {
            throw new IllegalArgumentException("不支持的收款方式：" + payMethod);
        }
        String customerName = str(body.get("customerName"));
        String customerPhone = str(body.get("customerPhone"));
        if (PAY_CREDIT.equals(payMethod) && !StringUtils.hasText(customerPhone)) {
            throw new IllegalArgumentException("挂账需要填写客户手机号（要挂到客户名下）");
        }
        if (PAY_ONLINE.contains(payMethod) && !StringUtils.hasText(customerPhone)) {
            // 不强制：扫码支付不需要手机号，但留个提示由前端决定是否要填
            log.debug("[POS] 在线支付未填客户手机号，按散客处理");
        }

        // 1. 明细算价（服务端算，不信前端传的金额）
        List<PosSaleItem> items = new ArrayList<>();
        BigDecimal goodsAmount = BigDecimal.ZERO;
        int itemCount = 0;
        for (Map<String, Object> raw : rawItems) {
            Long skuId = toLong(raw.get("skuId"));
            int qty = toInt(raw.get("quantity"));
            if (skuId == null || qty <= 0) {
                throw new IllegalArgumentException("商品或数量不正确");
            }
            if (qty > MAX_QTY) {
                throw new IllegalArgumentException("单个商品一次最多 " + MAX_QTY + " 件");
            }
            ProductSku sku = productSkuService.getById(skuId);
            if (sku == null || !tenantId.equals(sku.getTenantId())) {
                throw new IllegalArgumentException("商品不存在或不属于本店铺");
            }
            int stock = sku.getStockQuantity() == null ? 0 : sku.getStockQuantity();
            if (qty > stock) {
                throw new IllegalArgumentException((StringUtils.hasText(sku.getSkuCode())
                        ? sku.getSkuCode() : "商品") + " 库存仅剩 " + stock + " 件");
            }
            BigDecimal unitPrice = toAmount(raw.get("unitPrice"));
            if (unitPrice == null) {
                unitPrice = sku.getSalesPrice() != null ? sku.getSalesPrice()
                        : (sku.getTagPrice() != null ? sku.getTagPrice() : BigDecimal.ZERO);
            }
            if (unitPrice.signum() < 0) {
                throw new IllegalArgumentException("成交单价不能为负");
            }

            StyleInfo st = sku.getStyleId() == null ? null : styleInfoService.getById(sku.getStyleId());
            PosSaleItem it = new PosSaleItem();
            it.setTenantId(tenantId);
            it.setSkuId(skuId);
            it.setSkuCode(sku.getSkuCode());
            it.setStyleNo(sku.getStyleNo() != null ? sku.getStyleNo()
                    : (st == null ? null : st.getStyleNo()));
            it.setStyleName(st == null ? null : st.getStyleName());
            it.setColor(sku.getColor());
            it.setSize(sku.getSize());
            it.setTagPrice(sku.getTagPrice());
            it.setUnitPrice(unitPrice.setScale(2, RoundingMode.HALF_UP));
            it.setQuantity(qty);
            it.setAmount(unitPrice.multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP));
            items.add(it);
            goodsAmount = goodsAmount.add(it.getAmount());
            itemCount += qty;
        }
        goodsAmount = goodsAmount.setScale(2, RoundingMode.HALF_UP);

        // 2. 折扣 / 抹零 / 应收
        // 金额一律保留两位：前端可能传 "100"（不带小数），落库/返回口径要统一，
        // 否则「应收 899.5 元」和「折扣 100 元」在报表里长得不一样。
        BigDecimal discount = nz(toAmount(body.get("discount"))).setScale(2, RoundingMode.HALF_UP);
        BigDecimal roundOff = nz(toAmount(body.get("roundOff"))).setScale(2, RoundingMode.HALF_UP);
        if (discount.signum() < 0 || roundOff.signum() < 0) {
            throw new IllegalArgumentException("折扣与抹零不能为负数");
        }
        if (discount.compareTo(goodsAmount) > 0) {
            throw new IllegalArgumentException("折扣不能大于商品金额 " + goodsAmount);
        }
        BigDecimal afterDiscount = goodsAmount.subtract(discount);
        if (roundOff.compareTo(afterDiscount) > 0) {
            throw new IllegalArgumentException("抹零不能大于折后金额 " + afterDiscount);
        }
        BigDecimal total = afterDiscount.subtract(roundOff).setScale(2, RoundingMode.HALF_UP);

        // 3. 客户（有手机号就归并/建档；挂账必须有）
        Customer customer = null;
        if (StringUtils.hasText(customerPhone)) {
            customer = findOrCreateCustomer(tenantId, customerName, customerPhone);
        }

        // 4. 落单（收款状态先落 PAYING，等结算/渠道确认再落定）
        PosSale sale = new PosSale();
        sale.setTenantId(tenantId);
        sale.setSaleNo("POS" + LocalDateTime.now().format(NO_FMT)
                + String.format("%02d", NO_SEQ.incrementAndGet() % 100));
        sale.setCustomerId(customer == null ? null : customer.getId());
        sale.setCustomerName(StringUtils.hasText(customerName) ? customerName
                : (customer == null ? null : customer.getCompanyName()));
        sale.setCustomerPhone(StringUtils.hasText(customerPhone) ? customerPhone : null);
        sale.setItemCount(itemCount);
        sale.setGoodsAmount(goodsAmount);
        sale.setDiscountAmount(discount);
        sale.setRoundOffAmount(roundOff);
        sale.setTotalAmount(total);
        sale.setPayMethod(payMethod);
        sale.setPayStatus("PAYING");
        sale.setRemark(str(body.get("remark")));
        sale.setCashier(UserContext.username());
        sale.setStatus("NORMAL");
        sale.setCreateTime(LocalDateTime.now());
        sale.setUpdateTime(LocalDateTime.now());
        writeService.createSale(sale, items);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("saleNo", sale.getSaleNo());
        resp.put("goodsAmount", goodsAmount);
        resp.put("discountAmount", discount);
        resp.put("roundOffAmount", roundOff);
        resp.put("totalAmount", total);
        resp.put("payMethod", payMethod);
        resp.put("itemCount", itemCount);

        // 5a. 现金/刷卡：当场收款 → 立即结算（出库）
        if ("CASH".equals(payMethod) || "CARD".equals(payMethod)) {
            Map<String, Object> settled = writeService.settle(sale.getId(), "PAID", null);
            resp.putAll(settled);
            resp.put("saleNo", sale.getSaleNo());
            resp.put("totalAmount", total);
            return resp;
        }

        // 5b. 挂账：生成应收 → 结算为未收（出库）
        if (PAY_CREDIT.equals(payMethod)) {
            Map<String, Object> settled = writeService.settle(sale.getId(), "UNPAID", null);
            resp.putAll(settled);
            resp.put("saleNo", sale.getSaleNo());
            resp.put("totalAmount", total);
            return resp;
        }

        // 5c. 在线支付：向渠道下单拿二维码，**此时不出库**，等回调/轮询确认
        try {
            Map<String, Object> prepay = paymentOrchestrator.prepay(
                    tenantId, "POS_SALE", sale.getSaleNo(),
                    total.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP).longValueExact(),
                    "收银台 " + sale.getSaleNo(), channelOf(payMethod));
            resp.putAll(prepay);
            // 显式给出单据的收款状态：prepay 返回的 status 是**渠道视角**的（PENDING），
            // 而前端要判断的是"这张销售单处于待支付"。两者语义不同，不能混用。
            resp.put("payStatus", "PAYING");
            resp.put("saleNo", sale.getSaleNo());
            resp.put("totalAmount", total);
            log.info("[POS] 待支付单已生成 saleNo={} 方式={} 金额={}", sale.getSaleNo(), payMethod, total);
            return resp;
        } catch (RuntimeException e) {
            // 发起支付失败 → 把单置为已取消，避免留下一张永远待支付的废单
            writeService.markCancelled(sale.getId(), "发起支付失败：" + e.getMessage());
            throw new IllegalStateException("发起" + payMethod + "支付失败：" + e.getMessage(), e);
        }
    }

    /* ── 在线支付确认（回调 / 轮询共用） ───────────────────────────────────── */

    /**
     * 确认已收款并结算（出库）。由 {@code PosPaymentHandler} 在支付回调/轮询确认时调用。
     *
     * <p>回调链路没有登录上下文，租户由 {@code PosPaymentHandler} 设置后传入。
     */
    public void confirmPaid(String saleNo, String channel, String channelTradeNo, long paidFen) {
        PosSale sale = findSaleByNo(saleNo);
        if (sale == null) {
            throw new IllegalStateException("销售单不存在：" + saleNo);
        }
        if ("PAID".equals(sale.getPayStatus())) {
            log.info("[POS] 已确认过收款，跳过 saleNo={}", saleNo);
            return;
        }
        if (sale.getTotalAmount() != null
                && BigDecimal.valueOf(paidFen).compareTo(
                        sale.getTotalAmount().multiply(BigDecimal.valueOf(100))) < 0) {
            // 金额对不上：宁可让人看到，也不能按低价出库
            throw new IllegalStateException("实付金额小于应收金额，拒绝出库 saleNo=" + saleNo
                    + " 实付=" + paidFen + "分 应收=" + sale.getTotalAmount());
        }
        writeService.settle(sale.getId(), "PAID", channelTradeNo);
    }

    /** 取消待支付单（收银员取消 / 超时）：先关渠道单，再置本地为已取消 */
    public void cancelPending(String saleNo, String reason) {
        PosSale sale = findSaleByNo(saleNo);
        if (sale == null) {
            throw new IllegalArgumentException("销售单不存在：" + saleNo);
        }
        if (!"PAYING".equals(sale.getPayStatus())) {
            throw new IllegalArgumentException("该单不在待支付状态，无法取消");
        }
        PaymentGateway.PaymentType channel = channelOf(sale.getPayMethod());
        paymentOrchestrator.cancel(sale.getTenantId(), saleNo, channel, reason);
        writeService.markCancelled(sale.getId(), StringUtils.hasText(reason) ? reason : "收银员取消");
    }

    /**
     * 查询待支付单的支付状态（收银台轮询用）。
     *
     * <p>会主动向渠道查询并就地确认 —— 支付结果不能只等回调，回调可能丢。
     */
    public Map<String, Object> payState(String saleNo) {
        PosSale sale = findSaleByNo(saleNo);
        if (sale == null) {
            throw new IllegalArgumentException("销售单不存在：" + saleNo);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("saleNo", saleNo);
        out.put("payStatus", sale.getPayStatus());
        out.put("paid", "PAID".equals(sale.getPayStatus()));
        out.put("payMethod", sale.getPayMethod());
        out.put("totalAmount", sale.getTotalAmount());
        if (!"PAYING".equals(sale.getPayStatus())) {
            out.put("outstockNo", sale.getOutstockNo());
            return out;
        }
        Map<String, Object> state = paymentOrchestrator.queryAndConfirm(
                sale.getTenantId(), saleNo, channelOf(sale.getPayMethod()));
        out.putAll(state);
        PosSale after = findSaleByNo(saleNo);
        if (after != null) {
            out.put("payStatus", after.getPayStatus());
            out.put("paid", "PAID".equals(after.getPayStatus()));
            out.put("outstockNo", after.getOutstockNo());
        }
        return out;
    }

    /* ── 交班 ─────────────────────────────────────────────────────────────── */

    /** 今日汇总（交班对账）：单数/件数/金额/挂账金额 + 按收款方式拆分 + 最近单据 */
    public Map<String, Object> today() {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> out = new LinkedHashMap<>();
        if (tenantId == null) {
            out.put("summary", Map.of());
            out.put("byPayMethod", List.of());
            out.put("recent", List.of());
            return out;
        }
        Map<String, Object> summary = saleMapper.todaySummary(tenantId);
        out.put("summary", summary == null ? Map.of() : summary);
        out.put("byPayMethod", saleMapper.todayByPayMethod(tenantId));
        out.put("recent", saleMapper.todayRecent(tenantId, 20));
        return out;
    }

    // ── 内部 ────────────────────────────────────────────────────────────────

    private PosSale findSaleByNo(String saleNo) {
        Long tenantId = UserContext.tenantId();
        if (!StringUtils.hasText(saleNo)) {
            return null;
        }
        // 回调链路没有租户上下文，此时只按单号查（单号全局唯一）
        LambdaQueryWrapper<PosSale> w = new LambdaQueryWrapper<PosSale>()
                .eq(PosSale::getSaleNo, saleNo)
                .last("LIMIT 1");
        if (tenantId != null) {
            w.eq(PosSale::getTenantId, tenantId);
        }
        return saleMapper.selectOne(w);
    }

    /**
     * 收银台的收款方式 → 支付渠道枚举。
     *
     * <p>两套词汇故意不共用：收银台用的是「业务上的收款方式」（CASH/WECHAT/ALIPAY/CARD/CREDIT），
     * 支付模块用的是「渠道代码」（ALIPAY/WECHAT_PAY）。
     * 直接拿前者去 parse 后者会漏掉 {@code WECHAT → WECHAT_PAY} 这个映射
     * （这个 bug 真的发生过，被单测拦住了），所以这里显式翻译一次。
     */
    private static PaymentGateway.PaymentType channelOf(String payMethod) {
        if ("WECHAT".equals(payMethod)) {
            return PaymentGateway.PaymentType.WECHAT_PAY;
        }
        if ("ALIPAY".equals(payMethod)) {
            return PaymentGateway.PaymentType.ALIPAY;
        }
        throw new IllegalArgumentException("该收款方式不支持在线支付：" + payMethod);
    }

    private Customer findOrCreateCustomer(Long tenantId, String name, String phone) {
        Customer existing = customerOrchestrator.getByPhone(tenantId, phone);
        if (existing != null) {
            return existing;
        }
        Customer c = new Customer();
        c.setCompanyName(StringUtils.hasText(name) ? name + "（收银台）" : "散客（" + phone + "）");
        c.setContactPerson(StringUtils.hasText(name) ? name : phone);
        c.setContactPhone(phone);
        c.setSource("POS");
        c.setCustomerLevel("3");
        return customerOrchestrator.save(c);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> asList(Object v) {
        if (v instanceof List<?> list) {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) {
                    out.add((Map<String, Object>) m);
                }
            }
            return out;
        }
        return List.of();
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Long toLong(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static int toInt(Object v) {
        Long l = toLong(v);
        return l == null ? 0 : l.intValue();
    }

    /** 解析金额；无法解析返回 null（与 0 区分：0 是「明确填了 0」，null 是「没填」） */
    private static BigDecimal toAmount(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof BigDecimal b) {
            return b;
        }
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) {
            return null;
        }
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
