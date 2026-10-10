package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.shop.entity.ShopStyleLayout;
import com.fashion.supplychain.shop.mapper.ShopStyleLayoutMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * D-770：店铺商品详情页「模块化布局」编排。
 *
 * <p><b>产品取舍</b>：做「模块开关 + 上到下排序」，**不做无限自由拖拽**。
 * 主流电商平台（淘宝/1688/拼多多）实际也是模块化模板而非无限画布；
 * 自由拖拽在移动端体验差、保存易错、顾客端加载慢、结构不可控。
 *
 * <p><b>默认模块顺序</b>参照主流详情页自上而下的信息优先级：
 * 图片 → 价格 → 标题货号 → 服务承诺 → 颜色 → 尺码 → 数量 → 商品参数 →
 * 详情介绍 → 洗涤说明 → 购买按钮。
 *
 * <p><b>不预置数据行</b>：没有布局配置的款式用 {@link #DEFAULT_MODULES} 渲染，
 * 商家首次保存时才写入该款完整快照，避免给上百个款式逐个插 11 行。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShopStyleLayoutService {

    /** 模块定义：key → 默认标题（顺序即默认从上到下） */
    private static final Map<String, String> MODULE_DEFS = new LinkedHashMap<>();

    static {
        MODULE_DEFS.put("gallery", "图片轮播");
        MODULE_DEFS.put("price", "价格与库存");
        MODULE_DEFS.put("title", "标题与货号");
        MODULE_DEFS.put("promise", "服务承诺");
        // D-782：内容模块。顺序按「先给理由、再让人挑、最后说明与答疑」排，
        // 对标成熟详情页信息架构：先建立价值，再促成行动。
        MODULE_DEFS.put("points", "核心卖点");
        MODULE_DEFS.put("color", "颜色选择");
        MODULE_DEFS.put("size", "尺码选择");
        MODULE_DEFS.put("quantity", "购买数量");
        MODULE_DEFS.put("params", "商品参数");
        MODULE_DEFS.put("priceNote", "价格说明");
        MODULE_DEFS.put("detail", "详情介绍");
        MODULE_DEFS.put("faq", "常见问题");
        // D-783：评价放在洗涤之前 —— 买家看评价的时机通常在「看完说明、准备下单」，
        // 而不是滚到最底。
        MODULE_DEFS.put("reviews", "商品评价");
        MODULE_DEFS.put("wash", "洗涤说明");
        // D-784：推荐放最后 —— 它是「逛完这件之后去哪」，
        // 排在购买条正上方，既不打断看商品，又不让顾客走到死胡同。
        MODULE_DEFS.put("recommend", "猜你喜欢");
        MODULE_DEFS.put("purchase", "购买与加入购物车");
    }

    /** 默认顺序（列表顺序即 sortOrder） */
    public static final List<String> DEFAULT_MODULES = new ArrayList<>(MODULE_DEFS.keySet());

    /**
     * 参与排序的模块白名单。
     * 购买按钮允许隐藏（部分店铺只做展示不卖货），但**至少要保留 gallery 与 price** ——
     * 没有图片和价格的详情页对顾客毫无意义。
     */
    private static final List<String> HIDEABLE = Arrays.asList(
            "promise", "color", "size", "quantity", "params", "detail", "wash", "purchase", "title");

    private final ShopStyleLayoutMapper layoutMapper;

    public static List<String> knownModules() {
        return DEFAULT_MODULES;
    }

    public static String defaultTitle(String key) {
        return MODULE_DEFS.getOrDefault(key, key);
    }

    public static boolean canHide(String key) {
        return HIDEABLE.contains(key);
    }

    /** 读某款式的布局；无记录时返回默认（全部启用、默认顺序） */
    public List<ShopStyleLayout> layoutOf(Long styleId) {
        Long tenantId = UserContext.tenantId();
        List<ShopStyleLayout> rows = layoutMapper.selectList(
                new LambdaQueryWrapper<ShopStyleLayout>()
                        .eq(ShopStyleLayout::getTenantId, tenantId)
                        .eq(ShopStyleLayout::getStyleId, styleId)
                        .orderByAsc(ShopStyleLayout::getSortOrder));
        if (rows == null || rows.isEmpty()) {
            return defaultLayout();
        }
        return rows;
    }

    private List<ShopStyleLayout> defaultLayout() {
        List<ShopStyleLayout> list = new ArrayList<>();
        int i = 0;
        for (String key : DEFAULT_MODULES) {
            ShopStyleLayout l = new ShopStyleLayout();
            l.setModuleKey(key);
            l.setSortOrder(i++);
            l.setEnabled(1);
            list.add(l);
        }
        return list;
    }

    /**
     * 保存布局（整体覆盖该款式的模块配置）。
     *
     * @param items 前端提交的模块数组，元素需含 moduleKey/sortOrder/enabled
     */
    public int saveLayout(Long styleId, List<Map<String, Object>> items) {
        Long tenantId = UserContext.tenantId();
        if (styleId == null) {
            throw new IllegalArgumentException("款式不能为空");
        }
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("没有需要保存的模块配置");
        }
        // 未知模块直接忽略（前端版本更旧时会带上已下线的模块）
        List<Map<String, Object>> valid = items.stream()
                .filter(m -> m.get("moduleKey") != null
                        && MODULE_DEFS.containsKey(String.valueOf(m.get("moduleKey"))))
                .collect(Collectors.toList());
        if (valid.isEmpty()) {
            throw new IllegalArgumentException("没有有效的模块配置");
        }
        // 必留模块：画廊与价格不可隐藏
        Map<String, Integer> enabledMap = new LinkedHashMap<>();
        for (Map<String, Object> m : valid) {
            String key = String.valueOf(m.get("moduleKey"));
            boolean on = truthy(m.get("enabled"));
            enabledMap.put(key, on ? 1 : 0);
        }
        for (String must : List.of("gallery", "price")) {
            if (enabledMap.containsKey(must) && enabledMap.get(must) == 0) {
                throw new IllegalArgumentException(
                        "「" + MODULE_DEFS.get(must) + "」是顾客了解商品的必需信息，不能隐藏");
            }
        }

        layoutMapper.delete(new LambdaQueryWrapper<ShopStyleLayout>()
                .eq(ShopStyleLayout::getTenantId, tenantId)
                .eq(ShopStyleLayout::getStyleId, styleId));
        int saved = 0;
        int order = 0;
        List<Map<String, Object>> sorted = new ArrayList<>(valid);
        // 按前端给的 sortOrder 落库，缺失则保持提交顺序
        sorted.sort(Comparator.comparingInt(m -> {
            Object v = m.get("sortOrder");
            if (v == null) return Integer.MAX_VALUE;
            try {
                return Integer.parseInt(String.valueOf(v).trim());
            } catch (NumberFormatException e) {
                return Integer.MAX_VALUE;
            }
        }));
        for (Map<String, Object> m : sorted) {
            String key = String.valueOf(m.get("moduleKey"));
            ShopStyleLayout row = new ShopStyleLayout();
            row.setTenantId(tenantId);
            row.setStyleId(styleId);
            row.setModuleKey(key);
            row.setSortOrder(order++);
            row.setEnabled(enabledMap.getOrDefault(key, 1));
            Object title = m.get("moduleTitle");
            if (title != null && !String.valueOf(title).isBlank()) {
                String t = String.valueOf(title).trim();
                if (t.length() > 64) {
                    t = t.substring(0, 64);
                }
                row.setModuleTitle(t);
            }
            layoutMapper.insert(row);
            saved++;
        }
        log.info("[ShopLayout] 款式 {} 布局已保存，共 {} 个模块", styleId, saved);
        return saved;
    }

    private static boolean truthy(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.intValue() != 0;
        String s = String.valueOf(v).trim();
        return "1".equals(s) || "true".equalsIgnoreCase(s);
    }
}