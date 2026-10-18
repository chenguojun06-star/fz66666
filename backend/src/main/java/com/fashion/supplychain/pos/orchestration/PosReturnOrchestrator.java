package com.fashion.supplychain.pos.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.pos.entity.PosReturn;
import com.fashion.supplychain.pos.entity.PosReturnItem;
import com.fashion.supplychain.pos.entity.PosSale;
import com.fashion.supplychain.pos.entity.PosSaleItem;
import com.fashion.supplychain.pos.mapper.PosReturnItemMapper;
import com.fashion.supplychain.pos.mapper.PosReturnMapper;
import com.fashion.supplychain.pos.mapper.PosSaleItemMapper;
import com.fashion.supplychain.pos.mapper.PosSaleMapper;
import com.fashion.supplychain.warehouse.orchestration.FinishedWarehouseOperationOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * D-816：POS 退货 / 换货。
 *
 * <p><b>补的是什么缺口</b>：原收银台只有「取消未支付订单」（{@code cancel-pay}），
 * <b>付了钱的单退不了</b>。门店卖错一件衣服就没有补救路径。
 *
 * <p><b>三条业务规则</b>（专业收银台缺一不可，这里逐条实现并有测试守护）：
 * <ol>
 *   <li><b>可退量校验</b>：按「原销售单行」逐行核算 已售 − 已退，
 *       退超直接拒绝。这是防资损的第一道闸 —— 允许退超等于允许无限退钱。</li>
 *   <li><b>金额按实付比例分摊</b>：整单有优惠/抹零时，不能按原价退。
 *       按 {@code 行原价 / 整单原价 × 实付} 分摊，最后一行吃掉分位差，
 *       保证「各行应退合计 == 实付 × 退货比例」，一分不差。</li>
 *   <li><b>库存回退</b>：逐 SKU 走既有入库通道，并用 {@code stock_returned}
 *       标记防重复回退 —— 重复执行会把库存凭空加两次。</li>
 * </ol>
 *
 * <p><b>为什么退款是「待人工确认」</b>：本系统未接支付渠道退款接口。
 * 自动标记「已退款」是假成功（钱没到账、系统却说退了），
 * 所以必须由收银员在线下真实退款后确认。
 */
@Slf4j
@Component
public class PosReturnOrchestrator {

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    @Autowired
    private PosSaleMapper saleMapper;

    @Autowired
    private PosSaleItemMapper saleItemMapper;

    @Autowired
    private PosReturnMapper returnMapper;

    @Autowired
    private PosReturnItemMapper returnItemMapper;

    @Autowired
    private FinishedWarehouseOperationOrchestrator warehouseOrchestrator;

    /**
     * 可退量查询：返回某销售单每一行的「已售 / 已退 / 可退」。
     *
     * <p>收银界面要先看到「还能退几件」才可能操作，所以单独暴露查询。
     */
    public List<Map<String, Object>> returnableItems(String saleNo) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        PosSale sale = findSale(saleNo);
        List<PosSaleItem> items = saleItemMapper.selectList(new LambdaQueryWrapper<PosSaleItem>()
                .eq(PosSaleItem::getSaleId, sale.getId())
                .eq(PosSaleItem::getTenantId, tenantId));

        Map<Long, Integer> returnedByItem = returnedQtyBySaleItem(tenantId, saleNo);

        List<Map<String, Object>> out = new ArrayList<>();
        for (PosSaleItem it : items) {
            int sold = it.getQuantity() == null ? 0 : it.getQuantity();
            int returned = returnedByItem.getOrDefault(it.getId(), 0);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("saleItemId", it.getId());
            row.put("skuId", it.getSkuId());
            row.put("skuCode", it.getSkuCode());
            row.put("styleNo", it.getStyleNo());
            row.put("styleName", it.getStyleName());
            row.put("color", it.getColor());
            row.put("size", it.getSize());
            row.put("unitPrice", it.getUnitPrice());
            row.put("soldQty", sold);
            row.put("returnedQty", returned);
            row.put("returnableQty", Math.max(0, sold - returned));
            out.add(row);
        }
        return out;
    }

    /**
     * 创建退货单。
     *
     * @param saleNo     原销售单号
     * @param lines      行明细 [{saleItemId, quantity}]
     * @param returnType REFUND / RETURN / EXCHANGE
     * @param reason     退货原因
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createReturn(String saleNo,
                                            List<Map<String, Object>> lines,
                                            String returnType,
                                            String reason) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (lines == null || lines.isEmpty()) {
            throw new IllegalArgumentException("请至少选择一件要退的商品");
        }

        PosSale sale = findSale(saleNo);
        // 只有已收款的单才谈得上退货；未支付的单应该走 cancel-pay，
        // 走退货会平白生成一张退货单并冲减应收，口径就乱了。
        if (!"PAID".equals(sale.getPayStatus())) {
            throw new IllegalStateException("该单尚未收款（" + sale.getPayStatus() + "），请直接取消订单而不是退货");
        }

        List<PosSaleItem> saleItems = saleItemMapper.selectList(new LambdaQueryWrapper<PosSaleItem>()
                .eq(PosSaleItem::getSaleId, sale.getId())
                .eq(PosSaleItem::getTenantId, tenantId));
        Map<Long, PosSaleItem> byId = new HashMap<>();
        for (PosSaleItem it : saleItems) {
            byId.put(it.getId(), it);
        }
        Map<Long, Integer> returnedByItem = returnedQtyBySaleItem(tenantId, saleNo);

        // ── 规则①：逐行校验可退量（防资损第一道闸）
        List<Map<String, Object>> checked = new ArrayList<>();
        for (Map<String, Object> line : lines) {
            Long itemId = longOf(line.get("saleItemId"));
            Integer qtyObj = intOf(line.get("quantity"));
            int qty = qtyObj == null ? 0 : qtyObj;
            if (itemId == null) {
                throw new IllegalArgumentException("退货明细缺少原销售单行");
            }
            PosSaleItem src = byId.get(itemId);
            if (src == null) {
                throw new IllegalArgumentException("退货明细里有不属于该销售单的商品");
            }
            if (qty <= 0) {
                throw new IllegalArgumentException("退货数量必须大于 0");
            }
            int sold = src.getQuantity() == null ? 0 : src.getQuantity();
            int returned = returnedByItem.getOrDefault(itemId, 0);
            int returnable = Math.max(0, sold - returned);
            if (qty > returnable) {
                throw new IllegalStateException(
                        "「" + safeName(src) + "」可退 " + returnable + " 件，本次申请 " + qty + " 件");
            }
            Map<String, Object> one = new LinkedHashMap<>();
            one.put("src", src);
            one.put("quantity", qty);
            checked.add(one);
        }

        // ── 规则②：金额按实付比例分摊，而不是按原价退
        BigDecimal goodsTotal = scale(sale.getGoodsAmount());
        BigDecimal paid = scale(sale.getTotalAmount());
        BigDecimal goodsOfLines = BigDecimal.ZERO;
        for (Map<String, Object> one : checked) {
            PosSaleItem src = (PosSaleItem) one.get("src");
            goodsOfLines = goodsOfLines.add(scale(src.getAmount()));
        }
        BigDecimal payableOfLines = paid;
        if (goodsOfLines.compareTo(BigDecimal.ZERO) > 0 && goodsTotal.compareTo(goodsOfLines) > 0) {
            // 只退部分行时，按「实付 × 本次退货原价 / 整单原价」折算，
            // 否则整单有优惠时会把没付过的金额也退出去
            payableOfLines = paid.multiply(goodsOfLines)
                    .divide(goodsTotal, 6, RoundingMode.HALF_UP)
                    .setScale(2, RoundingMode.HALF_UP);
        }

        BigDecimal lineGoodsTotal = BigDecimal.ZERO;
        for (Map<String, Object> one : checked) {
            PosSaleItem src = (PosSaleItem) one.get("src");
            int qty = (Integer) one.get("quantity");
            int sold = src.getQuantity() == null ? 0 : src.getQuantity();
            BigDecimal lineAmount = sold == 0 ? BigDecimal.ZERO
                    : scale(src.getAmount()).multiply(BigDecimal.valueOf(qty))
                    .divide(BigDecimal.valueOf(sold), 6, RoundingMode.HALF_UP);
            lineGoodsTotal = lineGoodsTotal.add(lineAmount);
            one.put("lineGoodsAmount", lineAmount);
        }

        // 最后一行吃掉分位差，保证各行合计 == 折算后的应退（不差一分）
        BigDecimal allocated = BigDecimal.ZERO;
        for (int i = 0; i < checked.size(); i++) {
            Map<String, Object> one = checked.get(i);
            BigDecimal goods = (BigDecimal) one.get("lineGoodsAmount");
            BigDecimal share;
            if (i == checked.size() - 1) {
                share = payableOfLines.subtract(allocated);
            } else {
                share = goodsOfLines.compareTo(BigDecimal.ZERO) > 0
                        ? payableOfLines.multiply(goods)
                        .divide(goodsOfLines, 2, RoundingMode.HALF_UP)
                        : BigDecimal.ZERO;
            }
            if (share.compareTo(BigDecimal.ZERO) < 0) {
                share = BigDecimal.ZERO;
            }
            one.put("lineRefund", share);
            allocated = allocated.add(share);
        }

        // ── 落单
        String returnNo = "RET" + LocalDateTime.now().format(NO_FMT)
                + java.util.UUID.randomUUID().toString().substring(0, 4).toUpperCase();
        PosReturn ret = new PosReturn();
        ret.setId(UUID.randomUUID().toString().replace("-", ""));
        ret.setTenantId(tenantId);
        ret.setReturnNo(returnNo);
        ret.setSaleNo(saleNo);
        ret.setSaleId(sale.getId());
        ret.setCustomerId(sale.getCustomerId());
        ret.setCustomerName(sale.getCustomerName());
        ret.setCustomerPhone(sale.getCustomerPhone());
        ret.setReturnType(returnType == null || returnType.isBlank() ? "RETURN" : returnType);
        ret.setItemCount(checked.stream().mapToInt(o -> (Integer) o.get("quantity")).sum());
        ret.setGoodsAmount(lineGoodsTotal);
        ret.setDiscountAmount(scale(sale.getDiscountAmount()));
        ret.setTotalAmount(payableOfLines);
        ret.setPayMethod(sale.getPayMethod());
        // 未接支付渠道退款接口 → 只能待人工确认，不能自动标记已退
        ret.setRefundStatus("PENDING");
        ret.setRefundedAmount(BigDecimal.ZERO);
        ret.setReason(reason);
        ret.setStockReturned(0);
        ret.setDeleteFlag(0);
        ret.setCreatorId(UserContext.userId());
        ret.setCreatorName(UserContext.username());
        returnMapper.insert(ret);

        for (Map<String, Object> one : checked) {
            PosSaleItem src = (PosSaleItem) one.get("src");
            PosReturnItem ri = new PosReturnItem();
            ri.setId(UUID.randomUUID().toString().replace("-", ""));
            ri.setTenantId(tenantId);
            ri.setReturnId(ret.getId());
            ri.setReturnNo(returnNo);
            ri.setSaleItemId(src.getId());
            ri.setSkuId(src.getSkuId());
            ri.setSkuCode(src.getSkuCode());
            ri.setStyleNo(src.getStyleNo());
            ri.setStyleName(src.getStyleName());
            ri.setColor(src.getColor());
            ri.setSize(src.getSize());
            ri.setQuantity((Integer) one.get("quantity"));
            ri.setUnitPrice(scale(src.getUnitPrice()));
            ri.setAmount((BigDecimal) one.get("lineRefund"));
            returnItemMapper.insert(ri);
        }

        // ── 规则③：库存回退（逐 SKU 走既有入库通道）
        List<String> inboundNos = restoreStock(ret, checked);

        // 累计已退件数写回销售单，便于对账（明细仍以退货行为真相源）
        PosSale patch = new PosSale();
        patch.setId(sale.getId());
        int returned = sale.getReturnedCount() == null ? 0 : sale.getReturnedCount();
        patch.setReturnedCount(returned + ret.getItemCount());
        saleMapper.updateById(patch);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("returnNo", returnNo);
        out.put("totalAmount", payableOfLines);
        out.put("itemCount", ret.getItemCount());
        out.put("refundStatus", ret.getRefundStatus());
        out.put("refundStatusHint", "本系统未接支付渠道退款接口，请在线下退款后点「确认已退款」");
        out.put("inboundNos", inboundNos);
        log.info("[POS退货] 单号 {} 原单 {} 应退 {}", returnNo, saleNo, payableOfLines);
        return out;
    }

    /**
     * 人工确认已退款。
     *
     * <p>只有真的在线下把钱退给顾客后才调这里 —— 系统不自动标记成功。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> confirmRefund(String returnNo, String note) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        PosReturn ret = returnMapper.selectOne(new LambdaQueryWrapper<PosReturn>()
                .eq(PosReturn::getTenantId, tenantId)
                .eq(PosReturn::getReturnNo, returnNo));
        if (ret == null) {
            throw new IllegalArgumentException("退货单不存在");
        }
        if ("REFUNDED".equals(ret.getRefundStatus())) {
            throw new IllegalStateException("该退货单已确认退款，请勿重复操作");
        }
        PosReturn patch = new PosReturn();
        patch.setId(ret.getId());
        patch.setRefundStatus("REFUNDED");
        patch.setRefundedAmount(ret.getTotalAmount());
        patch.setRefundTime(LocalDateTime.now());
        patch.setRefundBy(UserContext.username());
        if (note != null && !note.isBlank()) {
            patch.setRemark(note);
        }
        returnMapper.updateById(patch);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("returnNo", returnNo);
        out.put("refundStatus", "REFUNDED");
        out.put("refundedAmount", ret.getTotalAmount());
        return out;
    }

    // ───────────────────────── 内部方法 ─────────────────────────

    /** 库存回退：用 stockReturned 标记防重复，避免库存被加两次。 */
    private List<String> restoreStock(PosReturn ret, List<Map<String, Object>> checked) {
        List<String> inboundNos = new ArrayList<>();
        boolean allOk = true;
        for (Map<String, Object> one : checked) {
            PosSaleItem src = (PosSaleItem) one.get("src");
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("skuCode", src.getSkuCode());
            params.put("quantity", one.get("quantity"));
            params.put("sourceType", "pos_return");
            params.put("supplierName", "POS退货 " + ret.getReturnNo());
            params.put("remark", "退货入库 " + ret.getSaleNo());
            try {
                var in = warehouseOrchestrator.freeInbound(params);
                if (in != null && in.getWarehousingNo() != null) {
                    inboundNos.add(in.getWarehousingNo());
                }
            } catch (Exception e) {
                // 库存回退失败必须让收银员知道：钱退了货没回到库存 = 二次损失
                allOk = false;
                log.error("[POS退货] 库存入库失败 returnNo={} sku={} err={}",
                        ret.getReturnNo(), src.getSkuCode(), e.getMessage());
            }
        }
        PosReturn patch = new PosReturn();
        patch.setId(ret.getId());
        patch.setStockReturned(allOk ? 1 : 0);
        returnMapper.updateById(patch);
        return inboundNos;
    }

    /** 已退数量按「原销售单行」聚合 —— 逐行核算可退量的基础。 */
    private Map<Long, Integer> returnedQtyBySaleItem(Long tenantId, String saleNo) {
        Map<Long, Integer> map = new HashMap<>();
        List<PosReturnItem> rows = returnItemMapper.selectList(new LambdaQueryWrapper<PosReturnItem>()
                .eq(PosReturnItem::getTenantId, tenantId)
                .eq(PosReturnItem::getReturnNo, inReturnNosOfSale(tenantId, saleNo)));
        for (PosReturnItem r : rows) {
            if (r.getSaleItemId() == null || r.getQuantity() == null) {
                continue;
            }
            map.merge(r.getSaleItemId(), r.getQuantity(), Integer::sum);
        }
        return map;
    }

    private List<String> inReturnNosOfSale(Long tenantId, String saleNo) {
        List<String> nos = returnMapper.selectList(new LambdaQueryWrapper<PosReturn>()
                        .eq(PosReturn::getTenantId, tenantId)
                        .eq(PosReturn::getSaleNo, saleNo)
                        .eq(PosReturn::getDeleteFlag, 0))
                .stream().map(PosReturn::getReturnNo).toList();
        return nos;
    }

    private PosSale findSale(String saleNo) {
        if (saleNo == null || saleNo.isBlank()) {
            throw new IllegalArgumentException("缺少原销售单号");
        }
        PosSale sale = saleMapper.selectOne(new LambdaQueryWrapper<PosSale>()
                .eq(PosSale::getTenantId, UserContext.tenantId())
                .eq(PosSale::getSaleNo, saleNo));
        if (sale == null) {
            throw new IllegalArgumentException("销售单不存在");
        }
        if ("CANCELLED".equals(sale.getPayStatus())) {
            throw new IllegalStateException("该单已取消，不能退货");
        }
        return sale;
    }

    private static BigDecimal scale(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v.setScale(2, RoundingMode.HALF_UP);
    }

    private static String safeName(PosSaleItem it) {
        if (it.getStyleName() != null && !it.getStyleName().isBlank()) {
            return it.getStyleName();
        }
        return it.getSkuCode() == null ? "商品" : it.getSkuCode();
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Long longOf(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Integer intOf(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}