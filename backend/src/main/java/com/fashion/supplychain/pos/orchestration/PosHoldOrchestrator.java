package com.fashion.supplychain.pos.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.pos.entity.PosHold;
import com.fashion.supplychain.pos.mapper.PosHoldMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * D-817：收银台挂单 / 取单 / 丢弃。
 *
 * <p>解决的是零售收银最高频却最容易被忽略的操作：顾客临时离开（试衣间、接电话、
 * 去拿发票）时购物车不能丢。原先没有这个能力，收银员只能干等或手工在纸上记 ——
 * 高峰期直接拖慢队列。
 *
 * <p><b>三条规则</b>：
 * <ol>
 *   <li><b>取回是原子的</b>：取回时把状态置为 RESUMED，避免两个人同时点「取回」
 *       拿到同一单（重复收款）。用带条件的 update 实现，不做「先查后改」。</li>
 *   <li><b>丢弃是显式的</b>：顾客走了/不买了要显式丢弃，不能让挂单无限堆积
 *       让列表变成垃圾场；但丢弃不删数据（保留 DISCARDED 状态可追溯）。</li>
 *   <li><b>不参与财务口径</b>：挂单没有任何金额流转，不进应收、不进库存、不进小票。</li>
 * </ol>
 */
@Slf4j
@Component
public class PosHoldOrchestrator {

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    @Autowired
    private PosHoldMapper holdMapper;

    /** 挂起当前购物车。 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> hold(Map<String, Object> body) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> cart = body != null && body.get("lines") instanceof List
                ? (List<Map<String, Object>>) body.get("lines") : List.of();
        if (cart.isEmpty()) {
            throw new IllegalArgumentException("购物车是空的，没有需要挂起的商品");
        }

        int itemCount = 0;
        BigDecimal goods = BigDecimal.ZERO;
        BigDecimal discount = BigDecimal.ZERO;
        for (Map<String, Object> line : cart) {
            itemCount += intOf(line.get("quantity"));
            BigDecimal amount = decOf(line.get("amount"));
            goods = goods.add(amount);
            discount = discount.add(decOf(line.get("discountAmount")));
        }

        String holdNo = "HLD" + LocalDateTime.now().format(NO_FMT)
                + UUID.randomUUID().toString().substring(0, 4).toUpperCase();

        PosHold h = new PosHold();
        h.setId(UUID.randomUUID().toString().replace("-", ""));
        h.setTenantId(tenantId);
        h.setHoldNo(holdNo);
        h.setCustomerId(str(body == null ? null : body.get("customerId")));
        h.setCustomerName(str(body == null ? null : body.get("customerName")));
        h.setCustomerPhone(str(body == null ? null : body.get("customerPhone")));
        h.setCartJson(toJson(cart));
        h.setItemCount(itemCount);
        h.setGoodsAmount(scale(goods));
        h.setDiscountAmount(scale(discount));
        h.setPayMethod(str(body == null ? null : body.get("payMethod")));
        h.setRemark(str(body == null ? null : body.get("remark")));
        h.setStatus("HELD");
        h.setCreatorId(UserContext.userId());
        h.setCreatorName(UserContext.username());
        holdMapper.insert(h);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("holdNo", holdNo);
        out.put("itemCount", itemCount);
        out.put("goodsAmount", scale(goods));
        log.info("[POS挂单] {} 件挂起，号 {}", itemCount, holdNo);
        return out;
    }

    /** 挂单列表（默认只列挂起中的）。 */
    public List<Map<String, Object>> list(boolean includeClosed) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<PosHold> qw = new LambdaQueryWrapper<PosHold>()
                .eq(PosHold::getTenantId, tenantId);
        if (!includeClosed) {
            qw.eq(PosHold::getStatus, "HELD");
        }
        qw.orderByDesc(PosHold::getCreateTime);

        List<PosHold> rows = holdMapper.selectList(qw);
        List<Map<String, Object>> out = new ArrayList<>();
        for (PosHold h : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("holdNo", h.getHoldNo());
            m.put("customerName", h.getCustomerName());
            m.put("customerPhone", h.getCustomerPhone());
            m.put("itemCount", h.getItemCount());
            m.put("goodsAmount", h.getGoodsAmount());
            m.put("discountAmount", h.getDiscountAmount());
            m.put("payMethod", h.getPayMethod());
            m.put("remark", h.getRemark());
            m.put("status", h.getStatus());
            m.put("creatorName", h.getCreatorName());
            m.put("createTime", h.getCreateTime());
            // 挂单列表也要有款式图/款号（铁律 15）：从快照里取第一件商品，
            // 由前端走后端权威接口解析款号与图 —— 这里不做字符串切分。
            Map<String, Object> preview = firstCartLine(h.getCartJson());
            m.put("previewSkuCode", text(preview, "skuCode"));
            m.put("previewStyleNo", text(preview, "styleNo"));
            m.put("previewStyleName", text(preview, "styleName"));
            out.add(m);
        }
        return out;
    }

    /**
     * 取回挂单：返回购物车快照，并原子地把状态置为 RESUMED。
     *
     * <p>用「带 status 条件的 update」而不是「先查后改」—— 两个收银员同时点
     * 「取回」时，后者会 update 影响 0 行，据此判定已被取走并报错，
     * 避免同一单被收两次款。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> resume(String holdNo) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        PosHold h = holdMapper.selectOne(new LambdaQueryWrapper<PosHold>()
                .eq(PosHold::getTenantId, tenantId)
                .eq(PosHold::getHoldNo, holdNo));
        if (h == null) {
            throw new IllegalArgumentException("挂单不存在");
        }
        if (!"HELD".equals(h.getStatus())) {
            throw new IllegalStateException("该挂单已被" + ("RESUMED".equals(h.getStatus()) ? "取回" : "丢弃") + "，请刷新列表");
        }

        PosHold patch = new PosHold();
        patch.setId(h.getId());
        patch.setStatus("RESUMED");
        patch.setResumedTime(LocalDateTime.now());
        int rows = holdMapper.update(patch, new LambdaQueryWrapper<PosHold>()
                .eq(PosHold::getId, h.getId())
                .eq(PosHold::getStatus, "HELD"));
        if (rows <= 0) {
            // 并发取回：别人先一步
            throw new IllegalStateException("该挂单刚被其他收银员取回，请刷新列表");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("holdNo", holdNo);
        out.put("lines", fromJson(h.getCartJson()));
        out.put("customerId", h.getCustomerId());
        out.put("customerName", h.getCustomerName());
        out.put("customerPhone", h.getCustomerPhone());
        out.put("payMethod", h.getPayMethod());
        out.put("remark", h.getRemark());
        return out;
    }

    /** 丢弃挂单（顾客走了 / 不买了）。保留记录以便追溯，不物理删除。 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> discard(String holdNo, String reason) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        PosHold h = holdMapper.selectOne(new LambdaQueryWrapper<PosHold>()
                .eq(PosHold::getTenantId, tenantId)
                .eq(PosHold::getHoldNo, holdNo));
        if (h == null) {
            throw new IllegalArgumentException("挂单不存在");
        }
        if (!"HELD".equals(h.getStatus())) {
            throw new IllegalStateException("该挂单已处理，请刷新列表");
        }

        PosHold patch = new PosHold();
        patch.setId(h.getId());
        patch.setStatus("DISCARDED");
        patch.setRemark(reason == null || reason.isBlank() ? "顾客放弃" : reason);
        int rows = holdMapper.update(patch, new LambdaQueryWrapper<PosHold>()
                .eq(PosHold::getId, h.getId())
                .eq(PosHold::getStatus, "HELD"));
        if (rows <= 0) {
            throw new IllegalStateException("该挂单刚被其他收银员处理，请刷新列表");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("holdNo", holdNo);
        out.put("status", "DISCARDED");
        return out;
    }

    // ───────────────────────── 内部方法 ─────────────────────────

    /**
     * 取挂单快照里第一件商品的 skuCode / styleNo（用于列表展示款式图与款号）。
     *
     * <p>快照坏了就返回 null：列表少一列图，但绝不能因此整页打不开。
     *
     * <p>款号只是**快照片段**，权威款号仍以前端走后端 {@code /style/sku/brief}
     * 解析的结果为准 —— 快照可能很久以前生成，不能直接当真值。
     */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> firstCartLine(String cartJson) {
        List<Map<String, Object>> cart = fromJson(cartJson);
        for (Map<String, Object> line : cart) {
            if (line == null) continue;
            Object code = line.get("skuCode");
            if (code != null && !String.valueOf(code).isBlank()) {
                return line;
            }
        }
        return null;
    }

    private static String text(Map<String, Object> line, String key) {
        if (line == null) return null;
        Object v = line.get(key);
        return v == null ? null : String.valueOf(v).trim();
    }

    private static final com.fasterxml.jackson.databind.ObjectMapper MAPPER =
            new com.fasterxml.jackson.databind.ObjectMapper();

    @SuppressWarnings("unchecked")
    private static String toJson(List<Map<String, Object>> cart) {
        try {
            return MAPPER.writeValueAsString(cart);
        } catch (Exception e) {
            throw new IllegalArgumentException("挂单内容序列化失败: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> fromJson(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return MAPPER.readValue(json, List.class);
        } catch (Exception e) {
            // 快照坏了就当空车返回，让收银员重新扫码，而不是整页打不开
            log.error("[POS挂单] 快照解析失败，按空车处理: {}", e.getMessage());
            return List.of();
        }
    }

    private static BigDecimal scale(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private static BigDecimal decOf(Object o) {
        if (o == null) {
            return BigDecimal.ZERO;
        }
        if (o instanceof Number n) {
            return BigDecimal.valueOf(n.doubleValue());
        }
        try {
            return new BigDecimal(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    private static int intOf(Object o) {
        if (o instanceof Number n) {
            return n.intValue();
        }
        if (o == null) {
            return 0;
        }
        try {
            return Integer.parseInt(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}