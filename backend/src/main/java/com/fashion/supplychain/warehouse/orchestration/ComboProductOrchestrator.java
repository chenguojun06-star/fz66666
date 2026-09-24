package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.warehouse.dto.ComboProductVO;
import com.fashion.supplychain.warehouse.entity.ComboProduct;
import com.fashion.supplychain.warehouse.entity.ComboProductItem;
import com.fashion.supplychain.warehouse.service.ComboProductItemService;
import com.fashion.supplychain.warehouse.service.ComboProductService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * D-529：组合商品（套装）编排——CRUD 事务、子SKU快照权威回填、可用库存计算。
 * 组合SKU本身不占库存：可用库存 = min(子SKU可用库存 / 子SKU单套数量)。
 */
@Service
@Slf4j
public class ComboProductOrchestrator {

    private static final DateTimeFormatter CODE_DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    @Autowired
    private ComboProductService comboProductService;

    @Autowired
    private ComboProductItemService comboProductItemService;

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private com.fashion.supplychain.style.service.StyleInfoService styleInfoService;

    // ==================== 查询 ====================

    public IPage<ComboProductVO> pageList(Map<String, Object> params) {
        int page = parseInt(params.get("page"), 1);
        int pageSize = parseInt(params.get("pageSize"), 20);
        Long tenantId = UserContext.tenantId();
        TenantAssert.requireTenantId();

        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ComboProduct> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ComboProduct>()
                        .eq(ComboProduct::getTenantId, tenantId);
        String keyword = trimToNull(params.get("keyword"));
        if (keyword != null) {
            // 关键词同时命中子商品的款号/款名/商品编码——搜"H001"能找到含 H001 的所有套装
            Set<Long> matchedComboIds = comboProductItemService.lambdaQuery()
                    .eq(ComboProductItem::getTenantId, tenantId)
                    .and(w -> w.like(ComboProductItem::getStyleNo, keyword)
                            .or().like(ComboProductItem::getSkuCode, keyword)
                            .or().like(ComboProductItem::getStyleName, keyword))
                    .list()
                    .stream()
                    .map(ComboProductItem::getComboId)
                    .collect(Collectors.toSet());
            wrapper.and(w -> {
                w.like(ComboProduct::getComboCode, keyword)
                        .or().like(ComboProduct::getComboName, keyword)
                        .or().like(ComboProduct::getShortCode, keyword);
                if (!matchedComboIds.isEmpty()) {
                    w.or().in(ComboProduct::getId, matchedComboIds);
                }
            });
        }
        String status = trimToNull(params.get("status"));
        if (status != null) {
            wrapper.eq(ComboProduct::getStatus, status);
        }
        wrapper.orderByDesc(ComboProduct::getUpdateTime);
        IPage<ComboProduct> result = comboProductService.page(new Page<>(page, pageSize), wrapper);
        List<ComboProductVO> vos = enrich(result.getRecords(), tenantId);
        Page<ComboProductVO> voPage = new Page<>(result.getCurrent(), result.getSize(), result.getTotal());
        voPage.setRecords(vos);
        return voPage;
    }

    public ComboProductVO getDetail(Long id) {
        Long tenantId = UserContext.tenantId();
        TenantAssert.requireTenantId();
        ComboProduct combo = comboProductService.getById(id);
        if (combo == null || !tenantId.equals(combo.getTenantId())) {
            throw new IllegalArgumentException("组合商品不存在或无权访问");
        }
        return enrich(Collections.singletonList(combo), tenantId).get(0);
    }

    /** 套装出库选择器：仅启用中的组合，带子项明细与可用库存 */
    public List<ComboProductVO> options(Map<String, Object> params) {
        int limit = parseInt(params.get("limit"), 20);
        Long tenantId = UserContext.tenantId();
        TenantAssert.requireTenantId();
        String keyword = trimToNull(params.get("keyword"));
        List<ComboProduct> combos = comboProductService.lambdaQuery()
                .eq(ComboProduct::getTenantId, tenantId)
                .eq(ComboProduct::getStatus, "ENABLED")
                .list();
        // keyword 过滤（code/name/shortCode）在内存中做——组合数量少，避免拼接复杂 wrapper
        if (keyword != null) {
            String kw = keyword.toLowerCase(Locale.ROOT);
            combos = combos.stream()
                    .filter(c -> contains(c.getComboCode(), kw) || contains(c.getComboName(), kw) || contains(c.getShortCode(), kw))
                    .collect(Collectors.toList());
        }
        combos = combos.stream()
                .sorted(Comparator.comparing(ComboProduct::getUpdateTime, Comparator.nullsFirst(Comparator.naturalOrder())).reversed())
                .limit(limit)
                .collect(Collectors.toList());
        return enrich(combos, tenantId);
    }

    // ==================== 写操作 ====================

    @Transactional(rollbackFor = Exception.class)
    public ComboProductVO create(Map<String, Object> body) {
        Long tenantId = UserContext.tenantId();
        TenantAssert.requireTenantId();
        ComboProduct combo = new ComboProduct();
        applyComboFields(combo, body);
        String code = trimToNull(body.get("comboCode"));
        if (code != null) {
            assertCodeAvailable(code, tenantId, null);
        } else {
            code = generateComboCode(tenantId);
        }
        combo.setComboCode(code);
        if (!StringUtils.hasText(combo.getStatus())) {
            combo.setStatus("ENABLED");
        }
        combo.setCreateBy(UserContext.username());
        combo.setCreateTime(LocalDateTime.now());
        combo.setUpdateTime(LocalDateTime.now());
        combo.setTenantId(tenantId);
        comboProductService.save(combo);

        List<ComboProductItem> items = buildItems(body, combo, tenantId);
        comboProductItemService.saveBatch(items);
        recalcAutoPrices(combo, items);
        comboProductService.updateById(combo);
        log.info("[组合商品] 创建: code={}, name={}, 子商品数={}, 操作人={}",
                combo.getComboCode(), combo.getComboName(), items.size(), UserContext.username());
        return getDetail(combo.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public ComboProductVO update(Long id, Map<String, Object> body) {
        Long tenantId = UserContext.tenantId();
        TenantAssert.requireTenantId();
        ComboProduct combo = comboProductService.getById(id);
        if (combo == null || !tenantId.equals(combo.getTenantId())) {
            throw new IllegalArgumentException("组合商品不存在或无权访问");
        }
        applyComboFields(combo, body);
        String code = trimToNull(body.get("comboCode"));
        if (code != null && !code.equals(combo.getComboCode())) {
            assertCodeAvailable(code, tenantId, id);
            combo.setComboCode(code);
        }
        combo.setUpdateTime(LocalDateTime.now());
        comboProductService.updateById(combo);

        if (body.containsKey("items")) {
            // 替换子项：旧明细逻辑删除 + 新明细插入（全局逻辑删除下禁止 setDeleteFlag+updateById）
            comboProductItemService.lambdaUpdate()
                    .eq(ComboProductItem::getComboId, combo.getId())
                    .remove();
            List<ComboProductItem> items = buildItems(body, combo, tenantId);
            comboProductItemService.saveBatch(items);
            recalcAutoPrices(combo, items);
            comboProductService.updateById(combo);
        }
        log.info("[组合商品] 更新: code={}, 操作人={}", combo.getComboCode(), UserContext.username());
        return getDetail(combo.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public void remove(Long id) {
        Long tenantId = UserContext.tenantId();
        TenantAssert.requireTenantId();
        ComboProduct combo = comboProductService.getById(id);
        if (combo == null || !tenantId.equals(combo.getTenantId())) {
            throw new IllegalArgumentException("组合商品不存在或无权访问");
        }
        comboProductService.removeById(combo.getId());
        comboProductItemService.lambdaUpdate()
                .eq(ComboProductItem::getComboId, combo.getId())
                .remove();
        log.info("[组合商品] 删除: code={}, 操作人={}", combo.getComboCode(), UserContext.username());
    }

    @Transactional(rollbackFor = Exception.class)
    public void setStatus(Long id, String status) {
        Long tenantId = UserContext.tenantId();
        TenantAssert.requireTenantId();
        if (!"ENABLED".equals(status) && !"DISABLED".equals(status)) {
            throw new IllegalArgumentException("无效的状态: " + status);
        }
        ComboProduct combo = comboProductService.getById(id);
        if (combo == null || !tenantId.equals(combo.getTenantId())) {
            throw new IllegalArgumentException("组合商品不存在或无权访问");
        }
        ComboProduct upd = new ComboProduct();
        upd.setId(combo.getId());
        upd.setStatus(status);
        upd.setUpdateTime(LocalDateTime.now());
        comboProductService.updateById(upd);
    }

    // ==================== 内部方法 ====================

    /** 表单字段 → 实体（编码/子项之外的字段） */
    private void applyComboFields(ComboProduct combo, Map<String, Object> body) {
        String name = trimToNull(body.get("comboName"));
        if (name == null) {
            throw new IllegalArgumentException("组合商品名称不能为空");
        }
        combo.setComboName(name);
        combo.setShortCode(trimToNull(body.get("shortCode")));
        combo.setColorSizeDesc(trimToNull(body.get("colorSizeDesc")));
        combo.setCategory(trimToNull(body.get("category")));
        combo.setTags(trimToNull(body.get("tags")));
        combo.setSalePrice(toBigDecimal(body.get("salePrice")));
        combo.setCostPrice(toBigDecimal(body.get("costPrice")));
        combo.setAutoSalePrice(parseInt(body.get("autoSalePrice"), 1));
        combo.setAutoCostPrice(parseInt(body.get("autoCostPrice"), 1));
        combo.setCoverUrl(trimToNull(body.get("coverUrl")));
        combo.setRemark(trimToNull(body.get("remark")));
        String status = trimToNull(body.get("status"));
        if (StringUtils.hasText(status)) {
            combo.setStatus(status);
        }
    }

    /**
     * 前端提交的子项 → 权威化实体：款号/款名/颜色/尺码一律从 t_product_sku 现查回填，
     * 不信任前端快照；同 skuCode 重复提交自动合并数量。
     */
    private List<ComboProductItem> buildItems(Map<String, Object> body, ComboProduct combo, Long tenantId) {
        Object itemsObj = body.get("items");
        if (!(itemsObj instanceof List) || ((List<?>) itemsObj).isEmpty()) {
            throw new IllegalArgumentException("请至少添加2个不同的子商品");
        }
        List<?> rawItems = (List<?>) itemsObj;
        Map<String, Integer> qtyByCode = new LinkedHashMap<>();
        for (Object raw : rawItems) {
            if (!(raw instanceof Map)) continue;
            @SuppressWarnings("unchecked")
            Map<String, Object> item = (Map<String, Object>) raw;
            String skuCode = trimToNull(item.get("skuCode"));
            if (skuCode == null) skuCode = trimToNull(item.get("sku"));
            if (skuCode == null) continue;
            int qty = parseInt(item.get("quantity"), 1);
            if (qty <= 0) {
                throw new IllegalArgumentException("子商品数量必须大于0: " + skuCode);
            }
            qtyByCode.merge(skuCode, qty, Integer::sum);
        }
        if (qtyByCode.size() < 2) {
            throw new IllegalArgumentException("组合商品至少需要2个不同的子商品");
        }
        List<ProductSku> skus = productSkuService.lambdaQuery()
                .eq(ProductSku::getTenantId, tenantId)
                .in(ProductSku::getSkuCode, qtyByCode.keySet())
                .list();
        Map<String, ProductSku> skuMap = skus.stream()
                .collect(Collectors.toMap(ProductSku::getSkuCode, Function.identity(), (a, b) -> a));
        // 款名从 t_style_info 批量补（ProductSku 无 styleName 字段）
        Set<Long> styleIds = skus.stream().map(ProductSku::getStyleId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, String> styleNameById = styleIds.isEmpty() ? Collections.emptyMap()
                : styleInfoService.listByIds(styleIds).stream()
                        .filter(Objects::nonNull)
                        .collect(Collectors.toMap(com.fashion.supplychain.style.entity.StyleInfo::getId,
                                s -> s.getStyleName() != null ? s.getStyleName() : "", (a, b) -> a));
        List<ComboProductItem> items = new ArrayList<>();
        int sort = 0;
        for (Map.Entry<String, Integer> entry : qtyByCode.entrySet()) {
            ProductSku sku = skuMap.get(entry.getKey());
            if (sku == null) {
                throw new IllegalArgumentException("子商品不存在: " + entry.getKey());
            }
            ComboProductItem item = new ComboProductItem();
            item.setComboId(combo.getId());
            item.setSkuId(sku.getId());
            item.setStyleId(sku.getStyleId());
            item.setStyleNo(sku.getStyleNo());
            item.setStyleName(sku.getStyleId() != null ? styleNameById.get(sku.getStyleId()) : null);
            item.setSkuCode(sku.getSkuCode());
            item.setColor(sku.getColor());
            item.setSize(sku.getSize());
            item.setQuantity(entry.getValue());
            item.setSort(sort++);
            item.setTenantId(tenantId);
            item.setCreateTime(LocalDateTime.now());
            item.setUpdateTime(LocalDateTime.now());
            items.add(item);
        }
        return items;
    }

    private void recalcAutoPrices(ComboProduct combo, List<ComboProductItem> items) {
        Map<Long, ProductSku> skuById = loadSkuByIds(items, UserContext.tenantId());
        if (combo.getAutoSalePrice() != null && combo.getAutoSalePrice() == 1) {
            combo.setSalePrice(sumPrice(skuById, items, true));
        }
        if (combo.getAutoCostPrice() != null && combo.getAutoCostPrice() == 1) {
            combo.setCostPrice(sumPrice(skuById, items, false));
        }
    }

    private BigDecimal sumPrice(Map<Long, ProductSku> skuById, List<ComboProductItem> items, boolean sale) {
        BigDecimal total = BigDecimal.ZERO;
        boolean any = false;
        for (ComboProductItem item : items) {
            ProductSku sku = skuById.get(item.getSkuId());
            if (sku == null) continue;
            BigDecimal price = sale ? sku.getSalesPrice() : sku.getCostPrice();
            if (price == null) continue;
            any = true;
            total = total.add(price.multiply(BigDecimal.valueOf(item.getQuantity() != null ? item.getQuantity() : 1)));
        }
        return any ? total : null;
    }

    private Map<Long, ProductSku> loadSkuByIds(List<ComboProductItem> items, Long tenantId) {
        Set<Long> skuIds = items.stream().map(ComboProductItem::getSkuId).filter(Objects::nonNull).collect(Collectors.toSet());
        if (skuIds.isEmpty()) {
            return Collections.emptyMap();
        }
        return productSkuService.lambdaQuery()
                .eq(ProductSku::getTenantId, tenantId)
                .in(ProductSku::getId, skuIds)
                .list()
                .stream()
                .collect(Collectors.toMap(ProductSku::getId, Function.identity(), (a, b) -> a));
    }

    /** 批量组装 VO：子项明细 + 可用库存（套） */
    private List<ComboProductVO> enrich(List<ComboProduct> combos, Long tenantId) {
        if (combos == null || combos.isEmpty()) {
            return new ArrayList<>();
        }
        List<Long> comboIds = combos.stream().map(ComboProduct::getId).collect(Collectors.toList());
        Map<Long, List<ComboProductItem>> itemsByCombo = comboProductItemService.lambdaQuery()
                .in(ComboProductItem::getComboId, comboIds)
                .orderByAsc(ComboProductItem::getSort)
                .list()
                .stream()
                .collect(Collectors.groupingBy(ComboProductItem::getComboId));

        Set<String> allSkuCodes = itemsByCombo.values().stream()
                .flatMap(List::stream)
                .map(ComboProductItem::getSkuCode)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, ProductSku> skuByCode = allSkuCodes.isEmpty() ? Collections.emptyMap()
                : productSkuService.lambdaQuery()
                        .eq(ProductSku::getTenantId, tenantId)
                        .in(ProductSku::getSkuCode, allSkuCodes)
                        .list()
                        .stream()
                        .collect(Collectors.toMap(ProductSku::getSkuCode, Function.identity(), (a, b) -> a));

        List<ComboProductVO> vos = new ArrayList<>();
        for (ComboProduct combo : combos) {
            ComboProductVO vo = new ComboProductVO();
            org.springframework.beans.BeanUtils.copyProperties(combo, vo);
            List<ComboProductItem> items = itemsByCombo.getOrDefault(combo.getId(), new ArrayList<>());
            // 子项实时库存/单价/款式图——组合详情与套装出库的库存评估都看实时值
            for (ComboProductItem item : items) {
                ProductSku sku = skuByCode.get(item.getSkuCode());
                if (sku != null) {
                    item.setAvailableQty(sku.getStockQuantity() != null ? Math.max(0, sku.getStockQuantity()) : 0);
                    item.setSalesPrice(sku.getSalesPrice());
                    item.setCostPrice(sku.getCostPrice());
                    item.setStyleImage(sku.getSkuColorImage());
                } else {
                    item.setAvailableQty(0);
                }
            }
            vo.setItems(items);
            vo.setAvailableStock(computeAvailableStock(items, skuByCode));
            vos.add(vo);
        }
        return vos;
    }

    /** 可用库存（套）= min(floor(子SKU库存 / 单套数量))，子SKU缺失或停用按 0 */
    private int computeAvailableStock(List<ComboProductItem> items, Map<String, ProductSku> skuByCode) {
        if (items == null || items.isEmpty()) {
            return 0;
        }
        int min = Integer.MAX_VALUE;
        for (ComboProductItem item : items) {
            ProductSku sku = skuByCode.get(item.getSkuCode());
            int stock = sku == null || sku.getStockQuantity() == null ? 0 : Math.max(0, sku.getStockQuantity());
            int qtyPerSet = item.getQuantity() != null && item.getQuantity() > 0 ? item.getQuantity() : 1;
            min = Math.min(min, stock / qtyPerSet);
        }
        return min == Integer.MAX_VALUE ? 0 : min;
    }

    /** 组合编码：ZH + yyyyMMdd + 4位租户内日序号（冲突自动递增） */
    private String generateComboCode(Long tenantId) {
        String prefix = "ZH" + LocalDate.now().format(CODE_DATE_FMT);
        ComboProduct max = comboProductService.lambdaQuery()
                .eq(ComboProduct::getTenantId, tenantId)
                .likeRight(ComboProduct::getComboCode, prefix)
                .orderByDesc(ComboProduct::getComboCode)
                .last("LIMIT 1")
                .one();
        int seq = 1;
        if (max != null && max.getComboCode() != null && max.getComboCode().length() > prefix.length()) {
            try {
                seq = Integer.parseInt(max.getComboCode().substring(prefix.length())) + 1;
            } catch (NumberFormatException ignored) {
                seq = 1;
            }
        }
        String candidate = prefix + String.format("%04d", seq);
        while (comboProductService.lambdaQuery()
                .eq(ComboProduct::getTenantId, tenantId)
                .eq(ComboProduct::getComboCode, candidate)
                .count() > 0) {
            seq++;
            candidate = prefix + String.format("%04d", seq);
        }
        return candidate;
    }

    private void assertCodeAvailable(String code, Long tenantId, Long excludeId) {
        ComboProduct existing = comboProductService.lambdaQuery()
                .eq(ComboProduct::getTenantId, tenantId)
                .eq(ComboProduct::getComboCode, code)
                .one();
        if (existing != null && !existing.getId().equals(excludeId)) {
            throw new IllegalArgumentException("组合商品编码已存在: " + code);
        }
    }

    private boolean contains(String text, String lowerKeyword) {
        return text != null && text.toLowerCase(Locale.ROOT).contains(lowerKeyword);
    }

    private String trimToNull(Object value) {
        if (value == null) return null;
        String text = String.valueOf(value).trim();
        return StringUtils.hasText(text) ? text : null;
    }

    private int parseInt(Object value, int defaultValue) {
        if (value == null) return defaultValue;
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private BigDecimal toBigDecimal(Object value) {
        if (value == null || !StringUtils.hasText(String.valueOf(value))) return null;
        try {
            return new BigDecimal(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
