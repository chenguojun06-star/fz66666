package com.fashion.supplychain.pos.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.orchestration.CustomerOrchestrator;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.pos.entity.PosSale;
import com.fashion.supplychain.pos.entity.PosSaleItem;
import com.fashion.supplychain.pos.mapper.PosSaleItemMapper;
import com.fashion.supplychain.pos.mapper.PosSaleMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.warehouse.orchestration.FinishedWarehouseOperationOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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
 *   <li>出库：逐 SKU 走既有的 {@code freeOutbound}（扣库存 + 落 t_product_outstock 台账），
 *       与店铺订单同一正路，仓库页看到的出库记录口径一致；</li>
 *   <li>收款：当场收钱（现金/微信/支付宝/刷卡）只**登记方式**，不接真实支付通道
 *       —— 零牌照风险、立刻能用；</li>
 *   <li>挂账：生成一条应收单，进既有「收付款中心」核销 ——
 *       与全系统「应收 + 收款核销」同一口径，不另起一套。</li>
 * </ul>
 *
 * <p><b>口径纪律</b>：
 * <ul>
 *   <li>金额一律**服务端算**（单价 × 数量、折扣、抹零、应收），前端只传原始输入；</li>
 *   <li>挂账必须留手机号（要归并客户，应收单的 customer_id 是必填）；</li>
 *   <li>当场收钱的不生成应收 —— 否则同一笔钱会在「已收款」和「应收未收」里各出现一次；</li>
 *   <li>改价留痕：明细同时存吊牌价与成交价，事后能看出这单让了多少。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PosSaleOrchestrator {

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final AtomicInteger NO_SEQ = new AtomicInteger(0);

    /** 收款方式白名单（只登记，不接真实支付通道） */
    private static final Set<String> PAY_METHODS =
            new LinkedHashSet<>(List.of("CASH", "WECHAT", "ALIPAY", "CARD", "CREDIT"));
    /** 挂账 */
    private static final String PAY_CREDIT = "CREDIT";
    private static final int MAX_QTY = 9999;
    private static final int MAX_LINES = 200;
    private static final int MAX_SEARCH = 60;

    private final PosSaleMapper saleMapper;
    private final PosSaleItemMapper saleItemMapper;
    private final ProductSkuService productSkuService;
    private final StyleInfoService styleInfoService;
    private final CustomerOrchestrator customerOrchestrator;
    private final ReceivableOrchestrator receivableOrchestrator;
    private final FinishedWarehouseOperationOrchestrator finishedWarehouseOperationOrchestrator;

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
     * 收银台开单：算价 → 校验库存 → 出库 → 收款或挂账。
     *
     * @param body items[{skuId,quantity,unitPrice?}] / payMethod / discount / roundOff /
     *             customerName / customerPhone / remark
     */
    @Transactional(rollbackFor = Exception.class)
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

        // 4. 落单
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
        sale.setPayStatus(PAY_CREDIT.equals(payMethod) ? "UNPAID" : "PAID");
        sale.setRemark(str(body.get("remark")));
        sale.setCashier(UserContext.username());
        sale.setStatus("NORMAL");
        sale.setCreateTime(LocalDateTime.now());
        sale.setUpdateTime(LocalDateTime.now());
        saleMapper.insert(sale);

        // 5. 逐条出库（与店铺订单同一正路：扣库存 + 落台账）
        List<String> outstockNos = new ArrayList<>();
        for (PosSaleItem it : items) {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("skuCode", it.getSkuCode());
            params.put("quantity", it.getQuantity());
            params.put("outstockType", "free_outbound");
            params.put("customerName", sale.getCustomerName());
            params.put("customerPhone", sale.getCustomerPhone());
            params.put("remark", "收银台 " + sale.getSaleNo());
            var out = finishedWarehouseOperationOrchestrator.freeOutbound(params);
            if (out != null && StringUtils.hasText(out.getOutstockNo())) {
                outstockNos.add(out.getOutstockNo());
            }
            it.setSaleId(sale.getId());
            saleItemMapper.insert(it);
        }

        // 6. 挂账才生成应收（当场收款不生成，否则同一笔钱记两次）
        String receivableId = null;
        if (PAY_CREDIT.equals(payMethod)) {
            Receivable receivable = new Receivable();
            receivable.setCustomerId(customer.getId());
            receivable.setCustomerName(customer.getCompanyName());
            receivable.setAmount(total);
            receivable.setDescription("收银台销售单 " + sale.getSaleNo());
            Receivable saved = receivableOrchestrator.create(receivable);
            receivableId = saved.getId();
        }

        PosSale patch = new PosSale();
        patch.setId(sale.getId());
        patch.setReceivableId(receivableId);
        if (!outstockNos.isEmpty()) {
            patch.setOutstockNo(outstockNos.get(0)
                    + (outstockNos.size() > 1 ? " 等" + outstockNos.size() + "单" : ""));
        }
        saleMapper.updateById(patch);

        log.info("[POS] 开单成功 saleNo={} tenant={} 金额={} 方式={} 件数={} 出库={}单",
                sale.getSaleNo(), tenantId, total, payMethod, itemCount, outstockNos.size());

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("saleNo", sale.getSaleNo());
        resp.put("goodsAmount", goodsAmount);
        resp.put("discountAmount", discount);
        resp.put("roundOffAmount", roundOff);
        resp.put("totalAmount", total);
        resp.put("payMethod", payMethod);
        resp.put("payStatus", sale.getPayStatus());
        resp.put("itemCount", itemCount);
        resp.put("receivableId", receivableId);
        resp.put("outstockNo", patch.getOutstockNo());
        return resp;
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
