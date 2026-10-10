package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.shop.entity.ShopConfig;
import com.fashion.supplychain.shop.entity.ShopOrder;
import com.fashion.supplychain.shop.entity.ShopOrderItem;
import com.fashion.supplychain.shop.mapper.ShopConfigMapper;
import com.fashion.supplychain.shop.mapper.ShopOrderItemMapper;
import com.fashion.supplychain.shop.mapper.ShopOrderMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.orchestration.ProductSkuOrchestrator;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.warehouse.orchestration.FinishedWarehouseOperationOrchestrator;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 店铺管理编排器（D-763）：配置 / 上架开关 / 订单列表，供管理端控制器薄壳调用。
 * D-768 增加店铺商品运营：SKU 售价 + 库存批量保存（含操作日志留痕）。
 */
@Slf4j
@Service
public class ShopAdminOrchestrator {

    @Autowired
    private ShopConfigMapper shopConfigMapper;

    @Autowired
    private ShopOrderMapper shopOrderMapper;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private ProductSkuOrchestrator productSkuOrchestrator;

    @Autowired
    private ShopOrderItemMapper shopOrderItemMapper;

    /** P2：商家查看自己店铺的商品评价（租户隔离由拦截器 + 显式 tenant_id 双重保证） */
    @Autowired
    private com.fashion.supplychain.shop.mapper.ShopReviewMapper shopReviewMapper;

    /** 取消订单时回补库存（与下单同一套仓库编排，留入库台账） */
    @Autowired
    private FinishedWarehouseOperationOrchestrator finishedWarehouseOperationOrchestrator;

    /** 取消订单时撤销挂账应收 */
    @Autowired
    private ReceivableOrchestrator receivableOrchestrator;

    @Autowired
    private PlatformTransactionManager transactionManager;

    /** D-513：批量发货逐条独立事务，避免单条失败把整批标 rollback-only */
    private TransactionTemplate requiresNewTx;

    @PostConstruct
    private void initRequiresNewTx() {
        requiresNewTx = new TransactionTemplate(transactionManager);
        requiresNewTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** 我的店铺配置（无则按默认建档，slug=t{tenantId}，默认打烊） */
    public ShopConfig config() {
        Long tenantId = UserContext.tenantId();
        ShopConfig config = shopConfigMapper.selectOne(new LambdaQueryWrapper<ShopConfig>()
                .eq(ShopConfig::getTenantId, tenantId)
                .last("LIMIT 1"));
        if (config == null) {
            config = new ShopConfig();
            config.setTenantId(tenantId);
            config.setSlug("t" + tenantId);
            config.setShopName("我的店铺");
            config.setEnabled(0);
            // D-513：默认全场包邮（与 C 端页面原有「包邮」承诺一致，升级不改变老顾客预期）
            config.setShippingEnabled(0);
            config.setShippingFee(BigDecimal.ZERO);
            config.setFreeShippingThreshold(BigDecimal.ZERO);
            // 详情页轮播：默认开启、4 秒（与主流电商一致；关掉由商家自己选）
            config.setCarouselAutoplay(1);
            config.setCarouselIntervalMs(4000);
            config.setCreateTime(LocalDateTime.now());
            config.setUpdateTime(LocalDateTime.now());
            shopConfigMapper.insert(config);
        }
        return config;
    }

    /** 更新店铺配置（名称/公告/打烊开关） */
    public void saveConfig(Map<String, Object> body) {
        ShopConfig existing = config();
        ShopConfig patch = new ShopConfig();
        patch.setId(existing.getId());
        if (body.get("shopName") != null) {
            patch.setShopName(String.valueOf(body.get("shopName")).trim());
        }
        if (body.get("notice") != null) {
            patch.setNotice(String.valueOf(body.get("notice")).trim());
        }
        if (body.get("enabled") != null) {
            boolean on = "1".equals(String.valueOf(body.get("enabled")))
                    || Boolean.parseBoolean(String.valueOf(body.get("enabled")));
            patch.setEnabled(on ? 1 : 0);
        }
        // D-513：配送设置。规则必须自洽，故在此做校验，避免存进"收运费但运费为0"
        // 或"门槛为负"这类无法解释的配置。
        if (body.get("shippingEnabled") != null) {
            boolean on = "1".equals(String.valueOf(body.get("shippingEnabled")))
                    || Boolean.parseBoolean(String.valueOf(body.get("shippingEnabled")));
            patch.setShippingEnabled(on ? 1 : 0);
        }
        if (body.get("shippingFee") != null) {
            BigDecimal fee = parseNonNegative(body.get("shippingFee"), "运费");
            patch.setShippingFee(fee);
        }
        if (body.get("freeShippingThreshold") != null) {
            BigDecimal threshold = parseNonNegative(body.get("freeShippingThreshold"), "包邮门槛");
            patch.setFreeShippingThreshold(threshold);
        }
        if (body.get("shippingNote") != null) {
            patch.setShippingNote(String.valueOf(body.get("shippingNote")).trim());
        }
        // 详情页图片轮播：自动播放开关 + 间隔（限制 2~10 秒，太快看不清、太慢像卡住）
        if (body.get("carouselAutoplay") != null) {
            boolean on = "1".equals(String.valueOf(body.get("carouselAutoplay")))
                    || Boolean.parseBoolean(String.valueOf(body.get("carouselAutoplay")));
            patch.setCarouselAutoplay(on ? 1 : 0);
        }
        if (body.get("carouselIntervalMs") != null) {
            int ms;
            try {
                ms = Integer.parseInt(String.valueOf(body.get("carouselIntervalMs")).trim());
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("轮播间隔必须是数字（毫秒）");
            }
            if (ms < 2000 || ms > 10000) {
                throw new IllegalArgumentException("轮播间隔请设置在 2~10 秒之间");
            }
            patch.setCarouselIntervalMs(ms);
        }
        // 收运费但运费为 0 = 规则无意义，直接拦截（避免"设置了却看不出效果"）
        int willBeEnabled = patch.getShippingEnabled() != null
                ? patch.getShippingEnabled()
                : (existing.getShippingEnabled() == null ? 0 : existing.getShippingEnabled());
        BigDecimal willBeFee = patch.getShippingFee() != null
                ? patch.getShippingFee()
                : (existing.getShippingFee() == null ? BigDecimal.ZERO : existing.getShippingFee());
        if (willBeEnabled == 1 && willBeFee.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("已开启收取运费，请填写大于 0 的运费金额");
        }

        /* ── D-769：服务承诺开关 ── */
        if (body.get("returnDays") != null) {
            int days;
            try {
                days = Integer.parseInt(String.valueOf(body.get("returnDays")).trim());
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("无理由退货天数必须是数字");
            }
            if (days < 0 || days > 90) {
                throw new IllegalArgumentException("无理由退货天数需在 0~90 之间，0 表示不承诺");
            }
            patch.setReturnDays(days);
        }
        if (body.get("promiseInStock") != null) {
            patch.setPromiseInStock(flagOf(body.get("promiseInStock")));
        }
        if (body.get("promiseAuthentic") != null) {
            patch.setPromiseAuthentic(flagOf(body.get("promiseAuthentic")));
        }
        if (body.get("promiseExtra") != null) {
            String extra = String.valueOf(body.get("promiseExtra")).trim();
            if (extra.length() > 255) {
                throw new IllegalArgumentException("其它服务承诺最多 255 字");
            }
            patch.setPromiseExtra(extra.isEmpty() ? null : extra);
        }
        // 无理由退货的「开关」就是天数本身：0 = 不承诺，>0 = 承诺该天数。
        // 因此不存在「开了却没填天数」的状态 —— 上一版曾写过一个
        // `willReturnDays == 1 && willReturnDays <= 0` 的校验，
        // 那是恒假条件（死代码），会让后人误以为这里有守卫，实际没有。已删除。
        patch.setUpdateTime(LocalDateTime.now());
        shopConfigMapper.updateById(patch);
        log.info("[ShopAdmin] 店铺配置已更新 tenant={}", existing.getTenantId());
    }


    /** 把 true/1/"true" 统一转成 1/0，避免前端各处分叉写法 */
    private static int flagOf(Object v) {
        if (v == null) {
            return 0;
        }
        String s = String.valueOf(v).trim();
        return ("1".equals(s) || "true".equalsIgnoreCase(s)) ? 1 : 0;
    }

    /** 解析非负金额（运费/门槛），非法值直接抛错避免静默写脏配置 */
    private BigDecimal parseNonNegative(Object v, String label) {
        try {
            BigDecimal d = new BigDecimal(String.valueOf(v).trim());
            if (d.compareTo(BigDecimal.ZERO) < 0) {
                throw new IllegalArgumentException(label + "不能为负数");
            }
            return d;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(label + "格式不正确：" + v);
        }
    }

    /** 上架/下架款式 */
    public void setListing(Long styleId, boolean listed) {
        Long tenantId = UserContext.tenantId();
        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null || !tenantId.equals(style.getTenantId())) {
            throw new IllegalArgumentException("款式不存在或无权操作");
        }
        StyleInfo patch = new StyleInfo();
        patch.setId(styleId);
        patch.setShopListed(listed ? 1 : 0);
        patch.setShopListingTime(listed ? LocalDateTime.now() : null);
        styleInfoService.updateById(patch);
        log.info("[ShopAdmin] 款式{} {}店铺", styleId, listed ? "上架" : "下架");
    }

    /**
     * 店铺商品运营：批量保存 SKU 的售价 + 库存（D-768）。
     *
     * <p>为什么必须编成一个事务、且必须放在编排器：
     * <ul>
     *   <li>{@code PUT /style/sku/{id}} 会强制保留原库存（改不了库存），库存只能走 updateStock，
     *       两条独立事务会导致「价改了库存没改」的脏状态；</li>
     *   <li>{@code updateStockById} 的参数是 <b>delta（增减量）</b> 且 SQL 为
     *       {@code GREATEST(0, stock + delta)} 会钳到 0，所以「目标值 → delta」的换算
     *       必须在服务端完成，不能让前端直接传增减量。</li>
     * </ul>
     *
     * <p>⚠️ 手工改库存不产生出入库单据，会绕过库存台账（产品决策已接受），
     * 因此每次库存变动都会写一条 {@code t_operation_log} 留痕。
     *
     * @param items 每项 {@code {skuId, salesPrice, stockQuantity}}，字段可缺省表示不改
     * @return 改价/改库存项数 + 每个 SKU 更新后的真实库存（可能被钳制，供前端回显）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> batchSaveSku(Long styleId, List<Map<String, Object>> items) {
        Long tenantId = UserContext.tenantId();
        if (styleId == null) {
            throw new IllegalArgumentException("styleId 不能为空");
        }
        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null || !tenantId.equals(style.getTenantId())) {
            throw new IllegalArgumentException("款式不存在或无权操作");
        }
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("没有需要保存的 SKU");
        }
        if (items.size() > 200) {
            throw new IllegalArgumentException("单次最多保存200条SKU");
        }

        Map<String, Integer> stockAfter = new LinkedHashMap<>();
        int priceChanged = 0;
        int stockChanged = 0;

        for (Map<String, Object> item : items) {
            Long skuId = toLong(item.get("skuId"));
            if (skuId == null) {
                throw new IllegalArgumentException("SKU 明细缺少 skuId");
            }
            ProductSku existing = productSkuService.getById(skuId);
            if (existing == null || !tenantId.equals(existing.getTenantId())
                    || !styleId.equals(existing.getStyleId())) {
                throw new IllegalArgumentException("SKU 不存在或不属于该款式：" + skuId);
            }

            int currentStock = existing.getStockQuantity() == null ? 0 : existing.getStockQuantity();
            BigDecimal currentPrice = existing.getSalesPrice() == null ? BigDecimal.ZERO : existing.getSalesPrice();
            BigDecimal targetPrice = toDecimal(item.get("salesPrice"));
            Integer targetStock = toInt(item.get("stockQuantity"));

            // 1) 售价：走 updateSku（内部会保留库存/编码/版本，且校验租户）
            if (targetPrice != null && targetPrice.compareTo(currentPrice) != 0) {
                ProductSku patch = new ProductSku();
                patch.setSalesPrice(targetPrice);
                Result<Boolean> r = productSkuOrchestrator.updateSku(skuId, patch);
                if (r == null || !Integer.valueOf(200).equals(r.getCode())
                        || Boolean.FALSE.equals(r.getData())) {
                    throw new IllegalArgumentException("售价保存失败："
                            + (r == null ? "无响应" : r.getMessage()));
                }
                priceChanged++;
            }

            // 2) 库存：updateStockById 是 delta 语义，按「目标值 - 当前值」换算
            int delta = targetStock == null ? 0 : targetStock - currentStock;
            if (delta != 0) {
                try {
                    productSkuService.updateStockById(skuId, delta);
                } catch (IllegalStateException e) {
                    throw new IllegalArgumentException("库存更新失败：" + e.getMessage());
                }
                stockChanged++;
                OperationLogAppendUtil.writeLog("店铺管理", "手工调整SKU",
                        String.format("库存 %d→%d（delta=%+d）skuCode=%s；手工调整，不走出入库台账",
                                currentStock, targetStock, delta, existing.getSkuCode()),
                        String.valueOf(skuId),
                        existing.getStyleNo() + "-" + existing.getColor() + "-" + existing.getSize());
            }

            // 3) 回读真实库存（delta 可能被 GREATEST(0, ...) 钳制）
            ProductSku after = productSkuService.getById(skuId);
            stockAfter.put(String.valueOf(skuId),
                    after == null || after.getStockQuantity() == null ? 0 : after.getStockQuantity());
        }

        log.info("[ShopAdmin] 店铺商品保存 styleId={} tenant={} 改价{}项 改库存{}项",
                styleId, tenantId, priceChanged, stockChanged);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("priceChanged", priceChanged);
        resp.put("stockChanged", stockChanged);
        resp.put("stockAfter", stockAfter);
        return resp;
    }

/**
     * D-769：跨款式批量调价（支持「统一设为」与「按百分比调整」）。
     *
     * <p><b>为什么必须两阶段（试算 → 执行）</b>：批量调价是直接动钱的高危操作，
     * 一次可能影响几十上百个 SKU。对标店小秘/聚水潭的「售价试算」，
     * 先返回逐款的调前/调后与<b>是否会转为亏损</b>，运营确认后再执行。
     * 不做试算直接改钱，出了错只能靠反查日志回滚，代价远高于多点一次。
     *
     * @param styleIds 目标款式
     * @param mode SET=统一设为 value；PERCENT_ADJUST=在原价基础上按 value(%) 调整
     * @param value  SET 时为绝对售价；PERCENT_ADJUST 时为百分比（10 表示 +10%，-5 表示 -5%）
     * @param dryRun true=仅试算不落库；false=实际执行
     * @return 逐款试算结果 + 汇总
     */
    public Map<String, Object> batchAdjustPrice(List<Long> styleIds, String mode,
                                                java.math.BigDecimal value, boolean dryRun) {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> preview = new ArrayList<>();

        if (styleIds == null || styleIds.isEmpty()) {
            out.put("items", preview);
            out.put("styleCount", 0);
            out.put("skuCount", 0);
            out.put("lossCount", 0);
            out.put("dryRun", dryRun);
            return out;
        }
        if (styleIds.size() > 200) {
            throw new IllegalArgumentException("单次最多批量调整 200 个款式");
        }
        boolean isPercent = "PERCENT_ADJUST".equalsIgnoreCase(mode);
        if (!isPercent && !"SET".equalsIgnoreCase(mode)) {
            throw new IllegalArgumentException("不支持的调价方式：" + mode);
        }
        if (value == null) {
            throw new IllegalArgumentException("调价数值不能为空");
        }
        if (isPercent && value.abs().compareTo(new java.math.BigDecimal("100")) > 0) {
            // 超过 ±100% 几乎必为误操作（如把 0.15 当 15 填成 1500）
            throw new IllegalArgumentException("百分比调整幅度不得超过 100%，当前 " + value + "%");
        }
        if (!isPercent && value.compareTo(java.math.BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("统一设售价必须大于 0");
        }

        List<ProductSku> skus = productSkuService.list(new LambdaQueryWrapper<ProductSku>()
                .in(ProductSku::getStyleId, styleIds)
                .eq(ProductSku::getTenantId, tenantId));
        Map<Long, List<ProductSku>> byStyle = skus.stream()
                .filter(k -> k.getStyleId() != null)
                .collect(Collectors.groupingBy(ProductSku::getStyleId));

        int skuCount = 0;
        int lossCount = 0;
        List<ProductSku> toUpdate = new ArrayList<>();

        for (Long styleId : styleIds) {
            List<ProductSku> list = byStyle.getOrDefault(styleId, List.of());
            java.math.BigDecimal oldMin = null, oldMax = null, newMin = null, newMax = null;
            java.math.BigDecimal oldCostMax = null, newCostMax = null;
            int styleSkuCount = 0;

            for (ProductSku k : list) {
                styleSkuCount++;
                skuCount++;
                java.math.BigDecimal old = k.getSalesPrice();
                java.math.BigDecimal cost = (k.getCostPrice() != null
                        && k.getCostPrice().compareTo(java.math.BigDecimal.ZERO) > 0)
                        ? k.getCostPrice() : null;
                java.math.BigDecimal neu;
                if (old == null || old.compareTo(java.math.BigDecimal.ZERO) <= 0) {
                    // 原价未设置：不猜它应该是多少 —— 百分比模式跳过，SET 模式按新值填
                    if (isPercent) {
                        continue;
                    }
                    neu = value;
                } else if (isPercent) {
                    neu = old.multiply(java.math.BigDecimal.ONE.add(
                            value.divide(new java.math.BigDecimal("100"), 6,
                                    java.math.RoundingMode.HALF_UP)))
                            .setScale(2, java.math.RoundingMode.HALF_UP);
                } else {
                    neu = value;
                }
                if (neu == null || neu.compareTo(java.math.BigDecimal.ZERO) <= 0) {
                    continue;
                }
                oldMin = minOf(oldMin, old);
                oldMax = maxOf(oldMax, old);
                newMin = minOf(newMin, neu);
                newMax = maxOf(newMax, neu);
                oldCostMax = maxOf(oldCostMax, cost);
                newCostMax = maxOf(newCostMax, cost);
                if (!dryRun) {
                    k.setSalesPrice(neu);
                    toUpdate.add(k);
                }
            }
            if (styleSkuCount == 0) {
                continue;
            }
            // D-769：保守口径（调后最低售价 − 最高成本），与前端「毛利(保守)」列口径一致
            java.math.BigDecimal profitBefore = marginProfit(oldMin, oldCostMax);
            java.math.BigDecimal profitAfter = marginProfit(newMin, newCostMax);
            boolean becomesLoss = profitBefore != null && profitAfter != null
                    && profitBefore.compareTo(java.math.BigDecimal.ZERO) > 0
                    && profitAfter.compareTo(java.math.BigDecimal.ZERO) <= 0;
            if (becomesLoss) {
                lossCount++;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("styleId", styleId);
            item.put("skuCount", styleSkuCount);
            item.put("oldMinPrice", oldMin);
            item.put("oldMaxPrice", oldMax);
            item.put("newMinPrice", newMin);
            item.put("newMaxPrice", newMax);
            item.put("oldProfit", profitBefore);
            item.put("newProfit", profitAfter);
            item.put("becomesLoss", becomesLoss);
            // 成本缺失时利润不可信，明确告知而不是给 0
            item.put("costKnown", newCostMax != null);
            preview.add(item);
        }

        if (!dryRun && !toUpdate.isEmpty()) {
            productSkuService.updateBatchById(toUpdate, 200);
        }

        out.put("items", preview);
        out.put("styleCount", preview.size());
        out.put("skuCount", skuCount);
        out.put("lossCount", lossCount);
        out.put("dryRun", dryRun);
        return out;
    }

    private static java.math.BigDecimal minOf(java.math.BigDecimal a, java.math.BigDecimal b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.compareTo(b) < 0 ? a : b;
    }

    private static java.math.BigDecimal maxOf(java.math.BigDecimal a, java.math.BigDecimal b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.compareTo(b) > 0 ? a : b;
    }

    /** 保守毛利 = 最低售价 − 最高成本；任一缺失则返回 null（不用 0 冒充） */
    private static java.math.BigDecimal marginProfit(java.math.BigDecimal minPrice,
                                                    java.math.BigDecimal maxCost) {
        if (minPrice == null || maxCost == null) {
            return null;
        }
        if (minPrice.compareTo(java.math.BigDecimal.ZERO) <= 0) {
            return null;
        }
        return minPrice.subtract(maxCost);
    }

    /**
     * 款式维度的 SKU 聚合，供店铺商品列表展示「售价区间 / 可售总量 / 颜色数」。
     * 一次 in 查询 + 内存分组，避免前端逐行 N+1。
     *
     * @return {@code {items: {"<styleId>": {minPrice,maxPrice,totalStock,colorCount,skuCount}}}}
     */
    public Map<String, Object> skuSummary(List<Long> styleIds) {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> items = new LinkedHashMap<>();
        if (styleIds != null && !styleIds.isEmpty()) {
            List<ProductSku> skus = productSkuService.list(new LambdaQueryWrapper<ProductSku>()
                    .in(ProductSku::getStyleId, styleIds)
                    .eq(ProductSku::getTenantId, tenantId));
            Map<Long, List<ProductSku>> byStyle = skus.stream()
                    .filter(k -> k.getStyleId() != null)
                    .collect(Collectors.groupingBy(ProductSku::getStyleId));

            for (Long styleId : styleIds) {
                List<ProductSku> list = byStyle.getOrDefault(styleId, List.of());
                BigDecimal min = null;
                BigDecimal max = null;
                // D-769：成本区间。minCost/maxCost 均为 null 表示该款 SKU 全部未维护成本，
                // 前端据此显示「成本未维护」而不是按 0 计算——用 0 冒充成本会让运营
                // 误以为在亏钱（或暴利），比不显示更危险。
                BigDecimal minCost = null;
                BigDecimal maxCost = null;
                int pricedSkuCount = 0;
                int costedSkuCount = 0;
                int stock = 0;
                Set<String> colors = new LinkedHashSet<>();
                for (ProductSku k : list) {
                    BigDecimal p = k.getSalesPrice();
                    if (p != null) {
                        if (min == null || p.compareTo(min) < 0) min = p;
                        if (max == null || p.compareTo(max) > 0) max = p;
                        pricedSkuCount++;
                    }
                    BigDecimal c = k.getCostPrice();
                    if (c != null && c.compareTo(BigDecimal.ZERO) > 0) {
                        if (minCost == null || c.compareTo(minCost) < 0) minCost = c;
                        if (maxCost == null || c.compareTo(maxCost) > 0) maxCost = c;
                        costedSkuCount++;
                    }
                    stock += k.getStockQuantity() == null ? 0 : k.getStockQuantity();
                    if (StringUtils.hasText(k.getColor())) colors.add(k.getColor());
                }
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("minPrice", min);
                row.put("maxPrice", max);
                row.put("minCost", minCost);
                row.put("maxCost", maxCost);
                // 成本/售价维护完整度：部分 SKU 缺成本时利润不可信，需显式告知前端
                row.put("costCoverage", list.isEmpty() ? 0
                        : (int) Math.round(costedSkuCount * 100.0 / list.size()));
                row.put("pricedSkuCount", pricedSkuCount);
                row.put("totalStock", stock);
                row.put("colorCount", colors.size());
                row.put("skuCount", list.size());
                items.put(String.valueOf(styleId), row);
            }
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("items", items);
        return resp;
    }

    /** 店铺订单分页（含买家联系方式与挂账状态） */
    public Page<ShopOrder> orders(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        int page = parseInt(params.get("page"), 1);
        int pageSize = parseInt(params.get("pageSize"), 20);
        String status = (String) params.get("status");
        String keyword = (String) params.get("keyword");
        return shopOrderMapper.selectPage(new Page<>(page, pageSize),
                new LambdaQueryWrapper<ShopOrder>()
                        .eq(ShopOrder::getTenantId, tenantId)
                        .eq(ShopOrder::getDeleteFlag, 0)
                        .eq(StringUtils.hasText(status), ShopOrder::getStatus, status)
                        .and(StringUtils.hasText(keyword), w -> w
                                .like(ShopOrder::getOrderNo, keyword)
                                .or().like(ShopOrder::getPhone, keyword)
                                .or().like(ShopOrder::getCustomerName, keyword))
                        .orderByDesc(ShopOrder::getCreateTime));
    }

    /**
     * D-513：店铺订单发货（待发货 → 已发货）。
     *
     * <p>为什么需要：C 端下单时库存已在 {@code ShopOrderOrchestrator.placeOrder} 里扣减、
     * 出库台账与应收也已生成，但管理端此前<b>没有任何发货入口</b> ——
     * 订单永远停在 PENDING_SHIP，电商闭环断在最后一环。本方法补齐该动作。
     *
     * <p>约束：仅 PENDING_SHIP 可发货（已发货/已取消重复发货直接报错，不静默改状态）；
     * 快递公司与单号选填（自提/同城配送可不填）。
     */
    public void shipOrder(String orderId, String expressCompany, String expressNo) {
        Long tenantId = UserContext.tenantId();
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        ShopOrder order = shopOrderMapper.selectById(orderId);
        if (order == null || !tenantId.equals(order.getTenantId())
                || Integer.valueOf(1).equals(order.getDeleteFlag())) {
            throw new IllegalArgumentException("订单不存在或无权操作");
        }
        if (!"PENDING_SHIP".equals(order.getStatus())) {
            throw new IllegalArgumentException("当前状态不可发货："
                    + ("SHIPPED".equals(order.getStatus()) ? "该订单已发货" : "该订单已取消"));
        }

        ShopOrder patch = new ShopOrder();
        patch.setId(order.getId());
        patch.setStatus("SHIPPED");
        patch.setExpressCompany(StringUtils.hasText(expressCompany) ? expressCompany.trim() : null);
        patch.setExpressNo(StringUtils.hasText(expressNo) ? expressNo.trim() : null);
        patch.setShipTime(LocalDateTime.now());
        shopOrderMapper.updateById(patch);

        OperationLogAppendUtil.writeLog("店铺管理", "订单发货",
                String.format("订单 %s 发货%s", order.getOrderNo(),
                        StringUtils.hasText(expressNo) ? "（" + expressCompany + " " + expressNo + "）" : ""),
                order.getId(), order.getOrderNo());
        log.info("[ShopAdmin] 店铺订单发货 orderNo={} tenant={} 快递={} {}",
                order.getOrderNo(), tenantId, expressCompany, expressNo);
    }

    private int parseInt(Object v, int def) {
        if (v == null) return def;
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (Exception e) {
            return def;
        }
    }

    // ── D-513：订单全生命周期（详情 / 取消 / 备注 / 批量发货 / 统计）────────────

    /** 订单详情：订单头 + 商品明细（管理端查看/售后核对用） */
    public Map<String, Object> orderDetail(String orderId) {
        ShopOrder order = requireOrder(orderId);
        List<ShopOrderItem> items = shopOrderItemMapper.selectList(
                new LambdaQueryWrapper<ShopOrderItem>()
                        .eq(ShopOrderItem::getOrderId, order.getId())
                        .eq(ShopOrderItem::getTenantId, UserContext.tenantId()));

        List<Map<String, Object>> itemRows = new ArrayList<>();
        for (ShopOrderItem it : items) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", it.getId());
            r.put("skuCode", it.getSkuCode());
            r.put("styleNo", it.getStyleNo());
            r.put("styleName", it.getStyleName());
            r.put("color", it.getColor());
            r.put("size", it.getSize());
            r.put("unitPrice", it.getUnitPrice());
            r.put("quantity", it.getQuantity());
            r.put("amount", it.getAmount());
            itemRows.add(r);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("order", order);
        data.put("items", itemRows);
        return data;
    }

    /**
     * D-513：取消订单（仅待发货可取消）。
     *
     * <p>取消必须**把下单时做的三件事反向做掉**，否则会留下脏数据：
     * <ol>
     *   <li>库存：下单时 freeOutbound 扣了库存 → 这里 freeInbound（sourceType=return_in）加回来；</li>
     *   <li>应收：下单时挂了应收 → 未收款的直接删除（已收款的拒绝取消，需走退款流程）；</li>
     *   <li>状态：置 CANCELLED 并留痕取消原因/时间。</li>
     * </ol>
     * 已发货订单不允许取消（货已出，应走退货/售后，不能一键抹掉）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancelOrder(String orderId, String reason) {
        ShopOrder order = requireOrder(orderId);
        if (!"PENDING_SHIP".equals(order.getStatus())) {
            throw new IllegalArgumentException("当前状态不可取消："
                    + ("SHIPPED".equals(order.getStatus()) ? "该订单已发货，请走退货/售后流程" : "该订单已取消"));
        }

        // 已收款则不能直接取消（钱已进账，必须走退款）
        if (StringUtils.hasText(order.getReceivableId())) {
            Receivable receivable = receivableOrchestrator.getById(order.getReceivableId());
            if (receivable != null && receivable.getReceivedAmount() != null
                    && receivable.getReceivedAmount().compareTo(BigDecimal.ZERO) > 0) {
                throw new IllegalArgumentException("该订单已收到款项，不能直接取消，请先在收付款中心处理退款");
            }
        }

        // 1) 库存回补：按下单时的出库明细逐条退回入库（与下单同一套仓库编排，留入库台账）
        List<ShopOrderItem> items = shopOrderItemMapper.selectList(
                new LambdaQueryWrapper<ShopOrderItem>()
                        .eq(ShopOrderItem::getOrderId, order.getId())
                        .eq(ShopOrderItem::getTenantId, UserContext.tenantId()));
        for (ShopOrderItem it : items) {
            if (!StringUtils.hasText(it.getSkuCode()) || it.getQuantity() == null || it.getQuantity() <= 0) {
                continue;
            }
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("skuCode", it.getSkuCode());
            params.put("quantity", it.getQuantity());
            params.put("sourceType", "return_in");
            params.put("warehouseLocation", "默认仓");
            params.put("remark", "店铺订单取消退回 " + order.getOrderNo());
            finishedWarehouseOperationOrchestrator.freeInbound(params);
        }

        // 2) 应收撤销（未收款才走到这里）
        if (StringUtils.hasText(order.getReceivableId())) {
            try {
                receivableOrchestrator.delete(order.getReceivableId());
            } catch (Exception e) {
                log.warn("[ShopAdmin] 取消订单时删除应收失败（不阻断取消）: orderNo={}, err={}",
                        order.getOrderNo(), e.getMessage());
            }
        }

        // 3) 状态与留痕
        String cancelReason = StringUtils.hasText(reason) ? reason.trim() : "未填写取消原因";
        ShopOrder patch = new ShopOrder();
        patch.setId(order.getId());
        patch.setStatus("CANCELLED");
        patch.setCancelReason(cancelReason);
        patch.setCancelTime(LocalDateTime.now());
        shopOrderMapper.updateById(patch);

        OperationLogAppendUtil.writeLog("店铺管理", "取消订单",
                String.format("订单 %s 已取消（原因：%s），库存已退回、应收已撤销",
                        order.getOrderNo(), cancelReason),
                order.getId(), order.getOrderNo());
        log.info("[ShopAdmin] 店铺订单取消 orderNo={} tenant={} 明细={}条 原因={}",
                order.getOrderNo(), order.getTenantId(), items.size(), cancelReason);
    }

    // ── D-513：售后（退款 / 退货退款）────────────────────────────────────────
    // 设计边界：**未发货**用「取消订单」（已实现）；**已发货**才走售后，两者不重叠。
    // 系统无在线支付通道，「同意退款」是**记账层面**动作（冲销挂账应收 + 退货则回补库存），
    // 实际打款由商家线下完成。

    /**
     * 登记售后（商家代顾客登记）。
     *
     * @param type REFUND_ONLY 仅退款（货不退，不回补库存）/ RETURN_REFUND 退货退款（回补库存）
     */
    public void applyAfterSale(String orderId, String type, String reason) {
        ShopOrder order = requireOrder(orderId);
        if (!"SHIPPED".equals(order.getStatus())) {
            throw new IllegalArgumentException("只有「已发货」的订单可登记售后；未发货请直接使用「取消订单」");
        }
        if (!"REFUND_ONLY".equals(type) && !"RETURN_REFUND".equals(type)) {
            throw new IllegalArgumentException("请选择售后类型（仅退款 / 退货退款）");
        }
        String current = StringUtils.hasText(order.getAfterSaleStatus()) ? order.getAfterSaleStatus() : "NONE";
        if ("APPLIED".equals(current)) {
            throw new IllegalArgumentException("该订单已有待处理的售后，请先处理完再登记");
        }
        if ("APPROVED".equals(current)) {
            throw new IllegalArgumentException("该订单售后已处理完成，不能重复登记");
        }

        ShopOrder patch = new ShopOrder();
        patch.setId(order.getId());
        patch.setAfterSaleStatus("APPLIED");
        patch.setAfterSaleType(type);
        patch.setAfterSaleReason(StringUtils.hasText(reason) ? reason.trim() : null);
        patch.setAfterSaleTime(LocalDateTime.now());
        shopOrderMapper.updateById(patch);

        OperationLogAppendUtil.writeLog("店铺管理", "登记售后",
                String.format("订单 %s 登记售后（%s）：%s", order.getOrderNo(),
                        "RETURN_REFUND".equals(type) ? "退货退款" : "仅退款",
                        StringUtils.hasText(reason) ? reason.trim() : "未填写原因"),
                order.getId(), order.getOrderNo());
        log.info("[ShopAdmin] 登记售后 orderNo={} type={}", order.getOrderNo(), type);
    }

    /**
     * 同意售后：退货退款则回补库存；挂账应收未收款则撤销（已收款需线下退款后在收付款中心核销）。
     *
     * @return 处理结果说明（含"需线下退款"等提示，前端直接展示）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> approveAfterSale(String orderId, String remark) {
        ShopOrder order = requireOrder(orderId);
        String current = StringUtils.hasText(order.getAfterSaleStatus()) ? order.getAfterSaleStatus() : "NONE";
        if (!"APPLIED".equals(current)) {
            throw new IllegalArgumentException("该订单没有待处理的售后");
        }

        boolean returnRefund = "RETURN_REFUND".equals(order.getAfterSaleType());
        int restored = 0;

        // 1) 退货退款：按下单明细回补库存（生成退回入库台账）
        if (returnRefund) {
            List<ShopOrderItem> items = shopOrderItemMapper.selectList(
                    new LambdaQueryWrapper<ShopOrderItem>()
                            .eq(ShopOrderItem::getOrderId, order.getId())
                            .eq(ShopOrderItem::getTenantId, UserContext.tenantId()));
            for (ShopOrderItem it : items) {
                if (!StringUtils.hasText(it.getSkuCode()) || it.getQuantity() == null || it.getQuantity() <= 0) {
                    continue;
                }
                Map<String, Object> params = new LinkedHashMap<>();
                params.put("skuCode", it.getSkuCode());
                params.put("quantity", it.getQuantity());
                params.put("sourceType", "return_in");
                params.put("warehouseLocation", "默认仓");
                params.put("remark", "店铺订单退货退回 " + order.getOrderNo());
                finishedWarehouseOperationOrchestrator.freeInbound(params);
                restored++;
            }
        }

        // 2) 应收：未收款直接撤销；已收款保留（无支付通道，需线下退款后到收付款中心核销）
        String receivableNote = "";
        if (StringUtils.hasText(order.getReceivableId())) {
            Receivable receivable = receivableOrchestrator.getById(order.getReceivableId());
            BigDecimal received = receivable == null || receivable.getReceivedAmount() == null
                    ? BigDecimal.ZERO : receivable.getReceivedAmount();
            if (received.compareTo(BigDecimal.ZERO) <= 0) {
                try {
                    receivableOrchestrator.delete(order.getReceivableId());
                    receivableNote = "挂账应收已撤销。";
                } catch (Exception e) {
                    log.warn("[ShopAdmin] 售后撤销应收失败: orderNo={}, err={}", order.getOrderNo(), e.getMessage());
                    receivableNote = "挂账应收撤销失败，请手动核对。";
                }
            } else {
                receivableNote = String.format("该订单已收款 ¥%s，系统不做资金出账，"
                        + "请线下退款后在「收付款中心」核销该应收。", received.toPlainString());
            }
        }

        String finalRemark = StringUtils.hasText(remark) ? remark.trim() : null;
        ShopOrder patch = new ShopOrder();
        patch.setId(order.getId());
        patch.setAfterSaleStatus("APPROVED");
        patch.setAfterSaleRemark(finalRemark);
        shopOrderMapper.updateById(patch);

        String action = returnRefund ? "退货退款" : "仅退款";
        OperationLogAppendUtil.writeLog("店铺管理", "同意售后",
                String.format("订单 %s 同意%s%s%s", order.getOrderNo(), action,
                        returnRefund ? "（已回补库存 " + restored + " 条）" : "（货不退，不回补库存）",
                        StringUtils.hasText(receivableNote) ? "；" + receivableNote : ""),
                order.getId(), order.getOrderNo());

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("restoredItems", restored);
        resp.put("message", action + "已同意。"
                + (returnRefund ? "库存已回补 " + restored + " 条。" : "")
                + receivableNote);
        log.info("[ShopAdmin] 同意售后 orderNo={} type={} 回补库存={}条",
                order.getOrderNo(), order.getAfterSaleType(), restored);
        return resp;
    }

    /** 拒绝售后 */
    public void rejectAfterSale(String orderId, String remark) {
        ShopOrder order = requireOrder(orderId);
        String current = StringUtils.hasText(order.getAfterSaleStatus()) ? order.getAfterSaleStatus() : "NONE";
        if (!"APPLIED".equals(current)) {
            throw new IllegalArgumentException("该订单没有待处理的售后");
        }
        String finalRemark = StringUtils.hasText(remark) ? remark.trim() : "未填写拒绝原因";
        ShopOrder patch = new ShopOrder();
        patch.setId(order.getId());
        patch.setAfterSaleStatus("REJECTED");
        patch.setAfterSaleRemark(finalRemark);
        shopOrderMapper.updateById(patch);

        OperationLogAppendUtil.writeLog("店铺管理", "拒绝售后",
                "订单 " + order.getOrderNo() + " 售后已拒绝：" + finalRemark,
                order.getId(), order.getOrderNo());
        log.info("[ShopAdmin] 拒绝售后 orderNo={} reason={}", order.getOrderNo(), finalRemark);
    }

    /** 商家备注（买家看不到，仅内部记录） */
    public void updateOrderRemark(String orderId, String remark) {
        ShopOrder order = requireOrder(orderId);
        ShopOrder patch = new ShopOrder();
        patch.setId(order.getId());
        patch.setRemark(StringUtils.hasText(remark) ? remark.trim() : null);
        shopOrderMapper.updateById(patch);
        OperationLogAppendUtil.writeLog("店铺管理", "订单备注",
                "订单 " + order.getOrderNo() + " 备注：" + (StringUtils.hasText(remark) ? remark.trim() : "（清空）"),
                order.getId(), order.getOrderNo());
    }

    /**
     * D-513：批量发货。逐条独立事务（REQUIRES_NEW），
     * 「跳过失败项、其余照常成功」才成立（整批一个事务会被单条失败标 rollback-only 拖垮，见 batchConfirm 教训）。
     */
    public Map<String, Object> batchShip(List<String> orderIds, String expressCompany, String expressNo) {
        if (orderIds == null || orderIds.isEmpty()) {
            throw new IllegalArgumentException("请先勾选要发货的订单");
        }
        int ok = 0;
        List<String> failed = new ArrayList<>();
        for (String id : orderIds) {
            try {
                requiresNewTx.executeWithoutResult(status -> shipOrder(id, expressCompany, expressNo));
                ok++;
            } catch (Exception e) {
                failed.add(id + "：" + e.getMessage());
                log.warn("[ShopAdmin] 批量发货跳过: id={}, reason={}", id, e.getMessage());
            }
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("shipped", ok);
        resp.put("failed", failed);
        return resp;
    }

    /** 订单概览统计（列表页顶部卡片：待发货 / 今日订单 / 今日销售额 / 累计销售额） */
    public Map<String, Object> orderStats() {
        Long tenantId = UserContext.tenantId();
        LocalDateTime todayStart = LocalDateTime.now().toLocalDate().atStartOfDay();

        long pendingShip = shopOrderMapper.selectCount(new LambdaQueryWrapper<ShopOrder>()
                .eq(ShopOrder::getTenantId, tenantId)
                .eq(ShopOrder::getDeleteFlag, 0)
                .eq(ShopOrder::getStatus, "PENDING_SHIP"));

        List<ShopOrder> todayOrders = shopOrderMapper.selectList(new LambdaQueryWrapper<ShopOrder>()
                .eq(ShopOrder::getTenantId, tenantId)
                .eq(ShopOrder::getDeleteFlag, 0)
                .ge(ShopOrder::getCreateTime, todayStart));

        BigDecimal todayAmount = BigDecimal.ZERO;
        long todayCount = 0;
        for (ShopOrder o : todayOrders) {
            if ("CANCELLED".equals(o.getStatus())) {
                continue;
            }
            todayCount++;
            todayAmount = todayAmount.add(o.getTotalAmount() == null ? BigDecimal.ZERO : o.getTotalAmount());
        }

        List<ShopOrder> all = shopOrderMapper.selectList(new LambdaQueryWrapper<ShopOrder>()
                .eq(ShopOrder::getTenantId, tenantId)
                .eq(ShopOrder::getDeleteFlag, 0));
        BigDecimal totalAmount = BigDecimal.ZERO;
        long totalCount = 0;
        for (ShopOrder o : all) {
            if ("CANCELLED".equals(o.getStatus())) {
                continue;
            }
            totalCount++;
            totalAmount = totalAmount.add(o.getTotalAmount() == null ? BigDecimal.ZERO : o.getTotalAmount());
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("pendingShip", pendingShip);
        resp.put("todayOrders", todayCount);
        resp.put("todayAmount", todayAmount);
        resp.put("totalOrders", totalCount);
        resp.put("totalAmount", totalAmount);
        return resp;
    }

    // ── P2：商品评价（商家侧查看）────────────────────────────────────────────
    // 评价此前只有 C 端写入、**没有任何商家侧读入口** —— 数据有了但没人消费等于白做。
    // 归属隔离：拦截器自动追加 tenant_id，这里再显式 eq 一次做双保险。

    /** 本店铺评价分页（可按款号 / 星级过滤）。返回体不含 consumer_id（对商家无意义且属隐私）。 */
    public Map<String, Object> reviews(int page, int pageSize, String styleNo, Integer rating) {
        Long tenantId = requireTenant();
        Page<com.fashion.supplychain.shop.entity.ShopReview> p = shopReviewMapper.selectPage(
                new Page<>(Math.max(1, page), Math.min(Math.max(1, pageSize), 100)),
                new LambdaQueryWrapper<com.fashion.supplychain.shop.entity.ShopReview>()
                        .eq(com.fashion.supplychain.shop.entity.ShopReview::getTenantId, tenantId)
                        .eq(StringUtils.hasText(styleNo),
                                com.fashion.supplychain.shop.entity.ShopReview::getStyleNo, styleNo)
                        .eq(rating != null,
                                com.fashion.supplychain.shop.entity.ShopReview::getRating, rating)
                        .orderByDesc(com.fashion.supplychain.shop.entity.ShopReview::getCreateTime));

        List<Map<String, Object>> rows = new ArrayList<>();
        for (com.fashion.supplychain.shop.entity.ShopReview r : p.getRecords()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", r.getId());
            row.put("orderNo", r.getOrderNo());
            row.put("styleNo", r.getStyleNo());
            row.put("rating", r.getRating());
            row.put("content", r.getContent());
            row.put("anonymous", Integer.valueOf(1).equals(r.getAnonymous()));
            row.put("createTime", r.getCreateTime());
            rows.add(row);
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("records", rows);
        resp.put("total", p.getTotal());
        return resp;
    }

    /** 本店铺评价概览：均分 / 总数 / 各星级分布（商家口碑一眼可见） */
    public Map<String, Object> reviewSummary() {
        Long tenantId = requireTenant();
        int[] dist = new int[6];
        long total = 0;
        long sum = 0;
        for (Map<String, Object> row : shopReviewMapper.countByRating(tenantId)) {
            int star = row.get("rating") == null ? 0 : Integer.parseInt(String.valueOf(row.get("rating")));
            int cnt = row.get("cnt") == null ? 0 : Integer.parseInt(String.valueOf(row.get("cnt")));
            if (star >= 1 && star <= 5) {
                dist[star] = cnt;
            }
            total += cnt;
            sum += (long) star * cnt;
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("total", total);
        data.put("avgRating", total == 0
                ? BigDecimal.ZERO.setScale(1, java.math.RoundingMode.HALF_UP)
                : BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(total), 1,
                        java.math.RoundingMode.HALF_UP));
        Map<String, Integer> distribution = new LinkedHashMap<>();
        for (int i = 5; i >= 1; i--) {
            distribution.put(i + "星", dist[i]);
        }
        data.put("distribution", distribution);
        return data;
    }

    private Long requireTenant() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalArgumentException("请先登录");
        }
        return tenantId;
    }

    /** 取订单并校验归属（不存在/跨租户/已删除一律拒绝） */
    private ShopOrder requireOrder(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        ShopOrder order = shopOrderMapper.selectById(orderId);
        if (order == null || !UserContext.tenantId().equals(order.getTenantId())
                || Integer.valueOf(1).equals(order.getDeleteFlag())) {
            throw new IllegalArgumentException("订单不存在或无权操作");
        }
        return order;
    }

    /** 空值返回 null（表示「本次不改」），非法值直接抛错避免静默写错数据 */
    private Long toLong(Object v) {
        if (v == null || !StringUtils.hasText(String.valueOf(v))) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("非法的 skuId：" + v);
        }
    }

    private Integer toInt(Object v) {
        if (v == null || !StringUtils.hasText(String.valueOf(v))) {
            return null;
        }
        try {
            return Integer.valueOf(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("非法的库存数量：" + v);
        }
    }

    private BigDecimal toDecimal(Object v) {
        if (v == null || !StringUtils.hasText(String.valueOf(v))) {
            return null;
        }
        try {
            BigDecimal d = new BigDecimal(String.valueOf(v).trim());
            if (d.compareTo(BigDecimal.ZERO) < 0) {
                throw new IllegalArgumentException("售价不能为负数：" + v);
            }
            return d;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("非法的售价：" + v);
        }
    }
}
