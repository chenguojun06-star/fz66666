package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.shop.entity.ShopReview;
import com.fashion.supplychain.shop.mapper.ShopPlatformMapper;
import com.fashion.supplychain.shop.mapper.ShopReviewMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * C 端商品评价编排（P2）。
 *
 * <p><b>规则（刻意从严，避免刷分）：</b>
 * <ul>
 *   <li>只有**已发货**订单可评价（未发货/已取消都评不了）；</li>
 *   <li>粒度是**一单一款一条**，重复提交直接报错，提交后不可修改；</li>
 *   <li>款式必须真的在该订单里 —— 不能凭空给别的商品打分；</li>
 *   <li>星级 1~5，内容 ≤ 500 字。</li>
 * </ul>
 *
 * <p>归属校验一律用 {@code orderNo + consumerId} 双条件，买家只能评价自己的订单。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShopReviewOrchestrator {

    private static final int MAX_CONTENT = 500;
    /** 商品页展示的评价条数 */
    private static final int LIST_LIMIT = 20;

    private final ShopReviewMapper reviewMapper;
    private final ShopPlatformMapper platformMapper;

    /** 提交评价 */
    @Transactional(rollbackFor = Exception.class)
    public void submit(String consumerId, String orderNo, String styleNo, int rating,
                       String content, boolean anonymous) {
        if (!StringUtils.hasText(orderNo) || !StringUtils.hasText(styleNo)) {
            throw new IllegalArgumentException("订单号与款式不能为空");
        }
        if (rating < 1 || rating > 5) {
            throw new IllegalArgumentException("请给出 1~5 星评分");
        }
        Map<String, Object> order = platformMapper.findOrderForConsumer(orderNo, consumerId);
        if (order == null) {
            throw new IllegalArgumentException("订单不存在");
        }
        if (!"SHIPPED".equals(String.valueOf(order.get("status")))) {
            throw new IllegalArgumentException("只有已发货的订单可以评价");
        }

        // 款式必须在该订单明细里
        Map<String, Object> target = null;
        for (Map<String, Object> it : platformMapper.listOrderItems(orderNo)) {
            if (styleNo.equals(String.valueOf(it.get("styleNo")))) {
                target = it;
                break;
            }
        }
        if (target == null) {
            throw new IllegalArgumentException("该商品不在此订单中");
        }

        String orderId = String.valueOf(order.get("orderId"));
        ShopReview existing = reviewMapper.selectOne(new LambdaQueryWrapper<ShopReview>()
                .eq(ShopReview::getOrderId, orderId)
                .eq(ShopReview::getStyleNo, styleNo)
                .last("LIMIT 1"));
        if (existing != null) {
            throw new IllegalArgumentException("该商品已评价过，评价不可修改");
        }

        String trimmed = StringUtils.hasText(content) ? content.trim() : null;
        if (trimmed != null && trimmed.length() > MAX_CONTENT) {
            throw new IllegalArgumentException("评价内容最多 " + MAX_CONTENT + " 字");
        }

        Long tenantId = order.get("tenantId") == null
                ? null : Long.valueOf(String.valueOf(order.get("tenantId")));

        ShopReview r = new ShopReview();
        r.setOrderId(orderId);
        r.setOrderNo(orderNo);
        r.setTenantId(tenantId);
        r.setConsumerId(consumerId);
        r.setStyleNo(styleNo);
        r.setStyleId(tenantId == null ? null : platformMapper.findStyleIdByNo(tenantId, styleNo));
        r.setSkuId(target.get("skuId") == null ? null : Long.valueOf(String.valueOf(target.get("skuId"))));
        r.setRating(rating);
        r.setContent(trimmed);
        r.setAnonymous(anonymous ? 1 : 0);
        reviewMapper.insert(r);

        log.info("[ShopReview] 评价提交 orderNo={} styleNo={} rating={} consumer={}",
                orderNo, styleNo, rating, consumerId);
    }

    /** 某款式的评价汇总 + 列表（公开页展示用） */
    public Map<String, Object> styleReviews(Long styleId, Integer limit) {
        if (styleId == null) {
            throw new IllegalArgumentException("缺少款式参数");
        }
        int size = limit == null || limit <= 0 ? LIST_LIMIT : Math.min(limit, LIST_LIMIT);
        List<Map<String, Object>> records = platformMapper.listReviewsByStyleId(styleId, size);

        List<Map<String, Object>> stats = platformMapper.listReviewStatsByStyleIds(List.of(styleId));
        BigDecimal avg = BigDecimal.ZERO;
        int count = 0;
        if (!stats.isEmpty()) {
            Map<String, Object> s = stats.get(0);
            count = s.get("cnt") == null ? 0 : Integer.parseInt(String.valueOf(s.get("cnt")));
            avg = s.get("avgRating") == null
                    ? BigDecimal.ZERO : new BigDecimal(String.valueOf(s.get("avgRating")));
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("styleId", styleId);
        data.put("rating", avg.setScale(1, RoundingMode.HALF_UP));
        data.put("count", count);
        data.put("records", records);
        return data;
    }

    /**
     * 给订单明细打上「是否已评价」标记（我的订单详情用）。
     * 返回新的列表，不改动入参。
     */
    public List<Map<String, Object>> markReviewed(String orderNo, List<Map<String, Object>> items) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (items == null) {
            return out;
        }
        Map<String, Map<String, Object>> byStyle = new LinkedHashMap<>();
        for (Map<String, Object> r : platformMapper.listReviewsByOrderNo(orderNo)) {
            byStyle.put(String.valueOf(r.get("styleNo")), r);
        }
        for (Map<String, Object> it : items) {
            Map<String, Object> row = new LinkedHashMap<>(it);
            Map<String, Object> review = byStyle.get(String.valueOf(it.get("styleNo")));
            row.put("reviewed", review != null);
            if (review != null) {
                row.put("myRating", review.get("rating"));
                row.put("myReview", review.get("content"));
            }
            out.add(row);
        }
        return out;
    }
}
