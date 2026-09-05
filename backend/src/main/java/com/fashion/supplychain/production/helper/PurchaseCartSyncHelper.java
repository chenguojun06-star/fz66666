package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PurchaseCartItem;
import com.fashion.supplychain.production.mapper.PurchaseCartItemMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 购物车跨节点同步（D-296）：
 * 任何节点（样衣采购/大货订单采购/采购指令/OpenAPI 等）生成采购单后，
 * 购物车里同一需求（同物料+同款+同色）的待采购条目必须同步清除，
 * 否则需求已被别处采购完，购物车仍挂着，会被再次下单造成重复采购。
 */
@Slf4j
@Component
public class PurchaseCartSyncHelper {

    @Autowired
    private PurchaseCartItemMapper purchaseCartItemMapper;

    @Autowired
    private com.fashion.supplychain.production.mapper.PurchaseCartMapper purchaseCartMapper;

    /**
     * 采购单落库后同步清理购物车同需求条目。
     * 匹配规则：materialCode 必须相等；
     * - 采购单有款关联（styleId/styleNo）：只清同款条目（styleId 或 styleNo 命中其一）；
     * - 采购单无款关联（指令/批量手动）：只清同样无款关联的条目，避免误删款式需求；
     * - 采购单有颜色：条目颜色需相等或为空（颜色不同=不同需求，不能清）。
     * 任何异常只记日志，绝不影响采购主流程。
     *
     * @return 清理掉的条目数（-1 表示执行失败被吞掉）
     */
    public int reconcileCartOnPurchase(MaterialPurchase purchase) {
        if (purchase == null || !StringUtils.hasText(purchase.getMaterialCode())) {
            return 0;
        }
        try {
            Long tenantId = purchase.getTenantId();
            if (tenantId == null) {
                tenantId = UserContext.tenantId();
            }
            if (tenantId == null) {
                return 0;
            }
            LambdaQueryWrapper<PurchaseCartItem> wrapper = new LambdaQueryWrapper<PurchaseCartItem>()
                    .eq(PurchaseCartItem::getTenantId, tenantId)
                    .eq(PurchaseCartItem::getMaterialCode, purchase.getMaterialCode().trim());

            boolean hasStyle = StringUtils.hasText(purchase.getStyleId()) || StringUtils.hasText(purchase.getStyleNo());
            if (hasStyle) {
                wrapper.and(w -> {
                    boolean needOr = false;
                    if (StringUtils.hasText(purchase.getStyleId())) {
                        w.eq(PurchaseCartItem::getStyleId, purchase.getStyleId().trim());
                        needOr = true;
                    }
                    if (StringUtils.hasText(purchase.getStyleNo())) {
                        if (needOr) {
                            w.or();
                        }
                        w.eq(PurchaseCartItem::getStyleNo, purchase.getStyleNo().trim());
                    }
                });
            } else {
                // 无款关联：仅清无款条目
                wrapper.and(w -> w
                        .and(q -> q.isNull(PurchaseCartItem::getStyleId).or().eq(PurchaseCartItem::getStyleId, ""))
                        .and(q -> q.isNull(PurchaseCartItem::getStyleNo).or().eq(PurchaseCartItem::getStyleNo, "")));
            }
            if (StringUtils.hasText(purchase.getColor())) {
                wrapper.and(w -> w
                        .eq(PurchaseCartItem::getColor, purchase.getColor().trim())
                        .or(q -> q.isNull(PurchaseCartItem::getColor).or().eq(PurchaseCartItem::getColor, "")));
            }

            List<PurchaseCartItem> hits = purchaseCartItemMapper.selectList(wrapper);
            if (hits.isEmpty()) {
                return 0;
            }
            List<String> ids = hits.stream().map(PurchaseCartItem::getId).collect(Collectors.toList());
            purchaseCartItemMapper.deleteByIds(ids, tenantId);
            // 删除后重算受影响购物车的汇总行（件数/合计金额），
            // 否则抽屉标题/合计仍显示旧数字，列表却已空（僵尸计数）
            java.util.Set<String> cartIds = hits.stream()
                    .map(PurchaseCartItem::getCartId)
                    .filter(StringUtils::hasText)
                    .collect(Collectors.toSet());
            for (String cartId : cartIds) {
                recalculateCartTotal(cartId, tenantId);
            }
            log.info("[CartSync] 采购单 {} 落库后清理购物车同需求条目 {} 条: materialCode={}, styleId={}, styleNo={}",
                    purchase.getPurchaseNo(), ids.size(), purchase.getMaterialCode(), purchase.getStyleId(), purchase.getStyleNo());
            return ids.size();
        } catch (Exception e) {
            log.warn("[CartSync] 购物车同步清理失败（不影响采购主流程）: purchaseNo={}, err={}",
                    purchase.getPurchaseNo(), e.getMessage());
            return -1;
        }
    }

    /** 与 PurchaseCartOrchestrator.recalculateCartTotal 同口径：按剩余条目重算购物车汇总行 */
    private void recalculateCartTotal(String cartId, Long tenantId) {
        try {
            List<PurchaseCartItem> remaining = purchaseCartItemMapper.selectByCartId(cartId, tenantId);
            com.fashion.supplychain.production.entity.PurchaseCart cart =
                    purchaseCartMapper.selectById(cartId);
            if (cart == null) {
                return;
            }
            cart.setTotalItems(remaining.size());
            cart.setTotalAmount(remaining.stream()
                    .map(PurchaseCartItem::getTotalAmount)
                    .filter(java.util.Objects::nonNull)
                    .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add));
            purchaseCartMapper.updateById(cart);
        } catch (Exception e) {
            log.warn("[CartSync] 重算购物车汇总失败: cartId={}, err={}", cartId, e.getMessage());
        }
    }
}
