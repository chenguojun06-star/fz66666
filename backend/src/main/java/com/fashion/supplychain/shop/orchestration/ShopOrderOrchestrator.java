package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.orchestration.CustomerOrchestrator;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.shop.entity.ShopConfig;
import com.fashion.supplychain.shop.entity.ShopListingContent;
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
import java.util.LinkedHashSet;
import java.util.Comparator;
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

    /** 成分明细是 JSON 文本，解析用（无状态，共享一个实例即可） */
    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private ShopConfigMapper shopConfigMapper;

    @Autowired
    private com.fashion.supplychain.shop.orchestration.ShopAddressService shopAddressService;

    /** D-782：商品详情内容（轮播图/视频/品牌/卖点/FAQ/价格说明） */
    @Autowired
    private ShopListingContentOrchestrator shopListingContentOrchestrator;

    /** 公开接口无上下文：以「shop 身份 + 目标租户」执行既有编排器 */
    @Autowired
    private ShopTenantContextRunner tenantContextRunner;

    /** D-784：浏览行为记录 + 商品推荐（详情页底部「猜你喜欢」） */
    @Autowired
    private ShopRecommendOrchestrator shopRecommendOrchestrator;

    @Autowired
    private ShopOrderMapper shopOrderMapper;

    @Autowired
    private ShopOrderItemMapper shopOrderItemMapper;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private com.fashion.supplychain.shop.orchestration.ShopStyleLayoutService styleLayoutService;

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
        // D-513：配送规则下发给 C 端，用于「包邮 / 满 X 包邮 / 运费 ¥Y」的真实展示
        // （此前页面硬编码「包邮」，与系统无运费概念自相矛盾）
        data.put("shippingEnabled", Integer.valueOf(1).equals(config.getShippingEnabled()));
        data.put("shippingFee", config.getShippingFee() == null ? BigDecimal.ZERO : config.getShippingFee());
        data.put("freeShippingThreshold", config.getFreeShippingThreshold() == null
                ? BigDecimal.ZERO : config.getFreeShippingThreshold());
        data.put("shippingNote", config.getShippingNote());
        // D-769：服务承诺透出给顾客端。不透出则前端永远读到 undefined，
        // 页面就会退化成「什么都不显示」——这正是要避免的静默失效。
        // 只在真正承诺时才给非 0 值，顾客端据此决定是否展示。
        data.put("returnDays", config.getReturnDays() == null ? 0 : config.getReturnDays());
        data.put("promiseInStock", Integer.valueOf(1).equals(config.getPromiseInStock()));
        data.put("promiseAuthentic", Integer.valueOf(1).equals(config.getPromiseAuthentic()));
        data.put("promiseExtra", config.getPromiseExtra());
        return data;
    }

    /**
     * D-513：按店铺配送规则计算运费。
     *
     * <p>规则（简单可解释，与店铺配置页文案一致）：
     * <ol>
     *   <li>未开启收运费 → 0（全场包邮）</li>
     *   <li>开启且商品金额 ≥ 包邮门槛（门槛 &gt; 0）→ 0（满额包邮）</li>
     *   <li>其余 → 默认运费</li>
     * </ol>
     * 服务端计算，前端只展示不参与，避免被篡改。
     */
    private BigDecimal resolveShippingFee(ShopConfig config, BigDecimal goodsAmount) {
        if (config == null || !Integer.valueOf(1).equals(config.getShippingEnabled())) {
            return BigDecimal.ZERO;
        }
        BigDecimal threshold = config.getFreeShippingThreshold();
        if (threshold != null && threshold.compareTo(BigDecimal.ZERO) > 0
                && goodsAmount.compareTo(threshold) >= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal fee = config.getShippingFee();
        return fee == null ? BigDecimal.ZERO : fee.max(BigDecimal.ZERO);
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


    /** 详情资料透出：空值不 put，前端据此显示「暂无」而不是渲染出空白块 */
    private static void putIfPresent(Map<String, Object> data, String key, Object value) {
        if (value == null) {
            return;
        }
        if (value instanceof CharSequence cs && cs.toString().isBlank()) {
            return;
        }
        data.put(key, value);
    }

    /** 顾客端商品详情（无浏览者身份；保留 2 参版，既有调用零改动） */
    public Map<String, Object> productDetail(String slug, Long styleId) {
        return productDetail(slug, styleId, null);
    }

    /**
     * 顾客端商品详情（带浏览者身份）。
     *
     * <p>浏览在这里记，而不是在控制器里记 —— 只有真正渲染成功的详情才算一次浏览
     * （商品不存在/已下架会提前抛异常，不该被计入）。
     * 无论是否登录都记一次按天计数（看板用）；登录顾客另记一份个人历史（推荐用）。
     */
    public Map<String, Object> productDetail(String slug, Long styleId, String consumerId) {
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
        // D-769：顾客端详情页缺失面料成分/尺寸表/详情介绍。
        // 这些字段 t_style_info 里早已存在（description / fabric_composition /
        // print_size / season / collar / sleeve …），只是从未透出给顾客端，
        // 导致详情页只有图 + 颜色尺码 + 价格 —— 与淘宝/1688 的详情页差距明显。
        // 只透出「已经在库里、不需要新录入」的资料，不编造任何内容；
        // 未维护的字段返回 null，前端显示「暂无」而不是留空或填占位说明。
        putIfPresent(data, "description", style.getDescription());
        // D-781：款式详情里存的是生产工艺/工序资料时，顾客端不展示。
        // 只隐藏、不删数据 —— 这份资料对车间和工厂是有用的。
        if (style.getDescription() != null && !style.getDescription().isBlank()) {
            data.put("descriptionVisibleToCustomer",
                    !ProductionContentDetector.looksLikeProductionContent(style.getDescription()));
        }
        putIfPresent(data, "fabricComposition", style.getFabricComposition());
        // D-777：fabric_parts 存的是 JSON 结构（[{"part":"上装","materials":"..."}]），
        // 原样透出会让顾客在页面上看到一串代码。这里在服务端解析成
        // 「部位 → 材质」的可读列表，解析失败则**不下发**，由前端整块跳过。
        //
        // 顺带修一个「数据在库里但顾客永远看不到」的问题：实测真实数据里
        // 成分明细的最后一行带 washNote（如「不可添加漂白剂／40度高温水洗」），
        // 而 wash_instructions 列却是 NULL —— 洗涤说明其实已经录进去了，
        // 只是从没被透出。这里把它作为 wash_instructions 的兜底。
        String washFromParts = null;
        try {
            String parts = style.getFabricCompositionParts();
            if (parts != null && !parts.isBlank()) {
                JsonNode arr = objectMapper.readTree(parts);
                if (arr.isArray() && !arr.isEmpty()) {
                    // 同一部位可能拆成多行（如上装：面料/里布/百分比各一行），
                    // 直接一行行渲染会出现四行都叫「上装」，观感很差 → 按部位合并。
                    Map<String, StringBuilder> byPart = new LinkedHashMap<>();
                    for (JsonNode node : arr) {
                        String part = node.path("part").asText("").trim();
                        String materials = node.path("materials").asText("").trim();
                        String washNote = node.path("washNote").asText("").trim();
                        if (!washNote.isEmpty() && washFromParts == null) {
                            washFromParts = washNote;
                        }
                        if (materials.isEmpty()) {
                            continue;
                        }
                        String key = part.isEmpty() ? "整体" : part;
                        StringBuilder sb = byPart.computeIfAbsent(key, k -> new StringBuilder());
                        if (sb.length() > 0) {
                            sb.append('；');
                        }
                        sb.append(materials);
                    }
                    if (!byPart.isEmpty()) {
                        List<Map<String, Object>> readable = new ArrayList<>();
                        byPart.forEach((part, sb) ->
                                readable.add(Map.of("part", part, "materials", sb.toString())));
                        data.put("fabricPartList", readable);
                    }
                }
            }
        } catch (Exception e) {
            // 解析失败不是致命问题：整块跳过即可，绝不能把原始 JSON 抛给顾客
            log.debug("[ShopPublic] 成分细节解析失败，已跳过该模块", e);
        }
        // 品类/季节：库里存的是英文枚举（SUMMER / WOMAN），顾客端要中文
        putIfPresent(data, "categoryText", enumText(style.getCategory()));
        putIfPresent(data, "seasonText", enumText(style.getSeason()));

        // ── 尺码表：三级优先级（D-780 + D-782） ──
        // D-780 实测：112 款里只有 4 款填过 print_size（3.6%），且填的是
        // 「XS」「M」这种单个码，根本不是尺码表 —— 该功能从未被真正用过。
        // 而 SKU 表里本来就躺着完整的「颜色 × 尺码 × 价格 × 库存」矩阵，
        // 所以没人填就自动生成，运营零录入。
        // 优先级：详情内容里的手工量体表 > 款式 print_size > SKU 自动矩阵表。
        ShopListingContent content = shopListingContentOrchestrator.find(config.getTenantId(), styleId);
        String manualSizeChart = content == null ? null : content.getSizeChart();
        if (StringUtils.hasText(manualSizeChart)) {
            data.put("sizeChart", manualSizeChart);
            data.put("sizeChartSource", "manual");
        } else if (StringUtils.hasText(style.getPrintSize())) {
            data.put("sizeChart", style.getPrintSize());
            data.put("sizeChartSource", "style");
        } else {
            Map<String, Object> auto = buildSizeChart(skus);
            if (auto != null) {
                data.put("sizeChart", auto);
            }
            data.put("sizeChartSource", "auto");
        }

        // D-782：轮播图/视频/品牌/卖点/常见问题/价格说明
        if (content != null) {
            data.putAll(shopListingContentOrchestrator.toCustomerView(content));
        }

        // 洗涤说明：优先独立字段，没有则用成分明细里带的 washNote 兜底
        if (style.getWashInstructions() != null && !style.getWashInstructions().isBlank()) {
            putIfPresent(data, "washInstructions", style.getWashInstructions());
        } else {
            putIfPresent(data, "washInstructions", washFromParts);
        }
        // D-770：详情页模块布局（商家自定义上到下顺序与开关）
        data.put("layout", styleLayoutService.layoutOf(styleId).stream().map(l -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("moduleKey", l.getModuleKey());
            m.put("sortOrder", l.getSortOrder());
            m.put("enabled", l.getEnabled());
            m.put("moduleTitle", l.getModuleTitle());
            return m;
        }).collect(java.util.stream.Collectors.toList()));
        putIfPresent(data, "season", style.getSeason());
        // 详情页图片轮播设置（店铺级）：随详情下发，避免顾客端再发一次请求。
        // 只给「自动播放开关 + 间隔毫秒」，默认开、4 秒。
        data.put("carouselAutoplay", !Integer.valueOf(0).equals(config.getCarouselAutoplay()));
        Integer interval = config.getCarouselIntervalMs();
        data.put("carouselIntervalMs", interval == null || interval < 2000 || interval > 10000
                ? 4000 : interval);
        // D-784：记一次浏览（计数 + 登录顾客的个人历史），失败不影响详情返回
        shopRecommendOrchestrator.recordView(
                config.getTenantId(), consumerId, styleId, style.getStyleNo());
        return data;
    }

    /**
     * 商品详情页底部「猜你喜欢」（D-784）。
     *
     * <p>只推**同一店铺**的商品：跨店推荐会把顾客带离当前店铺，
     * 而各租户直收钱、订单也不跨店，推荐跨店对成交没有帮助（甚至制造困惑）。
     */
    public List<Map<String, Object>> recommendations(String slug, Long styleId,
                                                     String consumerId, int limit) {
        ShopConfig config = resolveBySlug(slug);
        if (config == null) {
            throw new IllegalArgumentException("店铺不存在");
        }
        return shopRecommendOrchestrator.recommend(
                config.getTenantId(), styleId, consumerId, limit);
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
        return placeOrder(slug, customerName, phone, address, remark, items, null);
    }

    /**
     * 店铺下单全链（P0 版：可绑定平台消费者账号）。
     *
     * <p>{@code consumerId} 非空时写入 {@code t_shop_order.consumer_id}，
     * 顾客即可在平台「我的订单」跨店查看；为空时与免登录下单行为完全一致。
     *
     * <p>注意：事务注解在重载的两个方法上都要有 —— 6 参版本是控制器入口，
     * 7 参版本被它内部调用时注解不生效（自调用不走代理），此时靠外层事务兜住。
     */
    @Transactional(rollbackFor = Exception.class)
    public ShopOrder placeOrder(String slug, String customerName, String phone,
                                String address, String remark,
                                List<Map<String, Object>> items, String consumerId) {
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

        return runAsTenant(config.getTenantId(),
                () -> doPlaceOrder(config, customerName, phone, address, remark, items, consumerId));
    }

    private ShopOrder doPlaceOrder(ShopConfig config, String customerName, String phone,
                                   String address, String remark,
                                   List<Map<String, Object>> items, String consumerId) {
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
        // D-513：商品金额与运费拆开算，订单总额 = 两者之和（应收也按总额挂账）
        BigDecimal goodsAmount = orderItems.stream()
                .map(ShopOrderItem::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, java.math.RoundingMode.HALF_UP);
        BigDecimal shippingFee = resolveShippingFee(config, goodsAmount)
                .setScale(2, java.math.RoundingMode.HALF_UP);
        BigDecimal total = goodsAmount.add(shippingFee);
        int itemCount = orderItems.stream().mapToInt(ShopOrderItem::getQuantity).sum();

        // 2. 客户按手机号归并（无则新建），订单与应收都挂它
        Customer customer = findOrCreateCustomer(tenantId, customerName, phone);

        // 3. 落店铺订单主记录
        ShopOrder order = new ShopOrder();
        order.setOrderNo("SH" + LocalDateTime.now().format(NO_FMT)
                + String.format("%02d", NO_SEQ.incrementAndGet() % 100));
        order.setTenantId(tenantId);
        order.setCustomerId(customer.getId());
        order.setConsumerId(StringUtils.hasText(consumerId) ? consumerId : null);
        order.setCustomerName(customerName);
        order.setPhone(phone);
        order.setAddress(address);
        order.setTotalAmount(total);
        order.setGoodsAmount(goodsAmount);
        order.setShippingFee(shippingFee);
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
        return tenantContextRunner.run(tenantId, "shop", action);
    }

    /* ── D-770：C 端收货地址簿 ── */

    public List<com.fashion.supplychain.shop.entity.ShopAddress> addresses(String slug, String phone) {
        ShopConfig config = resolveBySlug(slug);
        if (config == null) {
            throw new IllegalArgumentException("店铺不存在");
        }
        return shopAddressService.listByPhone(config.getTenantId(), phone);
    }

    public Long saveAddress(String slug, Map<String, Object> body) {
        ShopConfig config = resolveBySlug(slug);
        if (config == null) {
            throw new IllegalArgumentException("店铺不存在");
        }
        Long id = shopAddressService.save(
                config.getTenantId(),
                String.valueOf(body.get("phone")),
                String.valueOf(body.get("consignee")),
                String.valueOf(body.get("phoneExt")),
                String.valueOf(body.get("province")),
                String.valueOf(body.get("city")),
                String.valueOf(body.get("district")),
                String.valueOf(body.get("detailAddr")),
                Boolean.TRUE.equals(body.get("isDefault"))
                        || "1".equals(String.valueOf(body.get("isDefault"))));
        return id;
    }

    public void setDefaultAddress(String slug, String phone, Long id) {
        ShopConfig config = resolveBySlug(slug);
        if (config == null) {
            throw new IllegalArgumentException("店铺不存在");
        }
        shopAddressService.setDefault(config.getTenantId(), phone, id);
    }

    public void deleteAddress(String slug, String phone, Long id) {
        ShopConfig config = resolveBySlug(slug);
        if (config == null) {
            throw new IllegalArgumentException("店铺不存在");
        }
        shopAddressService.delete(config.getTenantId(), phone, id);
    }


    /** 括号里的第一个数字：M(165/88A) → 165；无括号数字返回 -1 */
    private static final java.util.regex.Pattern SIZE_NUM =
            java.util.regex.Pattern.compile("(\\d+)");

    /** 纯字母码段的相对顺序（数值越大越靠后） */
    private static final Map<String, Long> SIZE_LABEL_RANK = Map.ofEntries(
            Map.entry("XXXS", 1L), Map.entry("XXS", 2L), Map.entry("XS", 3L),
            Map.entry("S", 4L), Map.entry("M", 5L), Map.entry("L", 6L),
            Map.entry("XL", 7L), Map.entry("XXL", 8L), Map.entry("XXXL", 9L),
            Map.entry("4XL", 10L), Map.entry("5XL", 11L),
            // 童装常见码
            Map.entry("80", 12L), Map.entry("90", 13L), Map.entry("100", 14L),
            Map.entry("110", 15L), Map.entry("120", 16L), Map.entry("130", 17L),
            Map.entry("140", 18L), Map.entry("150", 19L), Map.entry("160", 20L));

    /** 认不出顺序时统一排最后 */
    private static final long SIZE_UNKNOWN = Long.MAX_VALUE;

    /**
     * 尺码排序第一键：括号里的数字。
     *
     * <p>国标服装尺码 {@code M(165/88A)} 里的 165 是身高/胸围，随码数单调递增，
     * 直接就是天然顺序 —— 比任何按字母排序都可靠（字母排会把 XL 排到 XS 前）。
     *
     * <p>取不到（如纯字母码 {@code M}、或 {@code D(定制码)}）返回
     * {@link #SIZE_UNKNOWN}，交给第二键处理，<b>不猜</b>。
     */
    private static long sizeBodyKey(String text) {
        if (!StringUtils.hasText(text)) {
            return SIZE_UNKNOWN;
        }
        java.util.regex.Matcher m = SIZE_NUM.matcher(text.trim());
        if (m.find()) {
            try {
                return Long.parseLong(m.group(1));
            } catch (NumberFormatException ignored) {
                return SIZE_UNKNOWN;
            }
        }
        return SIZE_UNKNOWN;
    }

    /**
     * 尺码排序第二键：码段字母顺序。
     *
     * <p>用于两种情况：①括号数字并列（如 M(165/88A) 与 L(165/92A) 都是 165，
     * 此时靠码段 M&lt;L 区分）；②整款都是纯字母码（XS/S/M/L/XL）。
     */
    private static long sizeLabelKey(String text) {
        if (!StringUtils.hasText(text)) {
            return SIZE_UNKNOWN;
        }
        java.util.regex.Matcher head =
                java.util.regex.Pattern.compile("^[A-Z]+").matcher(text.trim().toUpperCase());
        if (head.find()) {
            Long rank = SIZE_LABEL_RANK.get(head.group());
            if (rank != null) {
                return rank;
            }
        }
        return SIZE_UNKNOWN;
    }

    /** 该款式的 sort_order 是否真的排过序（全空或全相同都算「没排过」） */
    private static boolean hasDistinctSortOrder(List<ProductSku> skus) {
        if (skus == null || skus.size() < 2) {
            return false;
        }
        Integer first = null;
        for (ProductSku k : skus) {
            Integer v = k.getSortOrder();
            if (v == null || v <= 0) {
                continue;
            }
            if (first == null) {
                first = v;
            } else if (!first.equals(v)) {
                return true;
            }
        }
        return false;
    }

    /**
     * D-780：从 SKU 矩阵自动生成尺码表。
     *
     * <p>结构（顾客视角的标准尺码表）：列为尺码、行为颜色，
     * 单元格显示价格；无库存的规格明确标「售罄」而不是留空 ——
     * 留空会被理解成"没这个码"，而"售罄"才是真实状态。
     *
     * @return 可直接渲染的尺码表；SKU 不足一档时返回 null（不生成半截表）
     */
    private static Map<String, Object> buildSizeChart(List<ProductSku> skus) {
        if (skus == null || skus.isEmpty()) {
            return null;
        }
        // D-780 尺码顺序：先看 sort_order，但**不能只靠它**。
        //
        // 实测生产库：216 个 SKU 里 155 个 sort_order 是 0/空，32 个款式整组相同，
        // 也就是说近七成款式根本没排过序，只按 sort_order 排的话尺码表会是乱的
        //（实测 BV26Q2W1208B 出来是 L,M,S,XL,XS）。
        // 运营不会为了看尺码表去补 sort_order，所以这里从**尺码本身**推导顺序：
        //   1) 带括号数字的（M(165/88A)）→ 取数字，165 随码数单调递增，天然有序
        //   2) 纯字母码的（XS/S/M/L/XL）→ 用标准码段顺序
        //   3) 认不出（如「D(定制码)」）→ 排最后，绝不猜
        final boolean hasUsableSortOrder = hasDistinctSortOrder(skus);
        List<ProductSku> ordered = new ArrayList<>(skus);
        if (hasUsableSortOrder) {
            // 运营真的排过序 → 尊重他的排序
            ordered.sort(Comparator.comparingInt(
                    k -> k.getSortOrder() == null ? Integer.MAX_VALUE : k.getSortOrder()));
        } else {
            // 没排过序 → 从尺码本身推导顺序（数字优先，数字并列时用码段字母兜底）
            ordered.sort(Comparator
                    .comparingLong((ProductSku k) -> sizeBodyKey(k.getSize()))
                    .thenComparingLong(k -> sizeLabelKey(k.getSize())));
        }

        LinkedHashSet<String> sizes = new LinkedHashSet<>();
        LinkedHashSet<String> colors = new LinkedHashSet<>();
        for (ProductSku k : ordered) {
            if (StringUtils.hasText(k.getSize())) {
                sizes.add(k.getSize().trim());
            }
            if (StringUtils.hasText(k.getColor())) {
                colors.add(k.getColor().trim());
            }
        }
        if (sizes.isEmpty()) {
            return null;
        }
        if (colors.isEmpty()) {
            colors.add("默认"); // 只有尺码没颜色时，也要能出表
        }

        // (size, color) → 该格
        Map<String, Map<String, Object>> cell = new LinkedHashMap<>();
        for (ProductSku k : ordered) {
            if (!StringUtils.hasText(k.getSize())) {
                continue;
            }
            String color = StringUtils.hasText(k.getColor()) ? k.getColor().trim() : "默认";
            cell.computeIfAbsent(k.getSize().trim(), x -> new LinkedHashMap<>()).put(color, k);
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        for (String size : sizes) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("size", size);
            Map<String, Object> byColor = cell.getOrDefault(size, Map.of());
            for (String color : colors) {
                ProductSku k = (ProductSku) byColor.get(color);
                if (k == null) {
                    row.put(color, null); // 该颜色没有这个码
                    continue;
                }
                int stock = k.getStockQuantity() == null ? 0 : k.getStockQuantity();
                Map<String, Object> v = new LinkedHashMap<>();
                v.put("price", k.getSalesPrice());
                v.put("stock", stock);
                v.put("soldOut", stock <= 0);
                row.put(color, v);
            }
            rows.add(row);
        }

        Map<String, Object> chart = new LinkedHashMap<>();
        chart.put("type", "sku-matrix");
        chart.put("colors", new ArrayList<>(colors));
        chart.put("rows", rows);
        return chart;
    }

    /** 英文枚举 → 中文文案；认不出时原样返回，不臆造 */
    private static String enumText(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        String c = code.trim();
        return switch (c.toUpperCase()) {
            case "SPRING" -> "春季";
            case "SUMMER" -> "夏季";
            case "AUTUMN" -> "秋季";
            case "WINTER" -> "冬季";
            case "WOMAN" -> "女装";
            case "MAN" -> "男装";
            case "KIDS", "CHILDREN" -> "童装";
            case "UNISEX" -> "中性";
            default -> c;
        };
    }

}
