package com.fashion.supplychain.pos.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.pos.entity.PosSale;
import com.fashion.supplychain.pos.entity.PosSaleItem;
import com.fashion.supplychain.pos.mapper.PosSaleItemMapper;
import com.fashion.supplychain.pos.mapper.PosSaleMapper;
import com.fashion.supplychain.warehouse.orchestration.FinishedWarehouseOperationOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 收银台的事务内写操作（落单 / 出库结算 / 取消）。
 *
 * <p><b>为什么要单独一个类</b>：在线支付发起时要调渠道 HTTP 接口（几百毫秒）。
 * 如果把「插入销售单」和「调渠道接口」放在同一个事务里，数据库连接会在外部调用期间
 * 一直占着 —— 收银高峰期很容易把连接池拖干。所以拆成：
 * <pre>
 *   createSale（事务） → 调渠道（无事务） → settle / markCancelled（事务）
 * </pre>
 * 拆出来的另一个好处是补偿动作（发起支付失败 → 把单置为已取消）变得显式可读。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PosSaleWriteService {

    private final PosSaleMapper saleMapper;
    private final PosSaleItemMapper saleItemMapper;
    private final FinishedWarehouseOperationOrchestrator finishedWarehouseOperationOrchestrator;
    private final ReceivableOrchestrator receivableOrchestrator;

    /**
     * 落销售单 + 明细（**不出库**）。
     *
     * <p>收款状态统一先落 {@code PAYING}（待支付），随后按收款方式结算：
     * 现金/刷卡当场结算为 PAID、挂账结算为 UNPAID、在线支付等渠道确认后结算为 PAID。
     * 这样"钱没到位就不出库"是同一条路径保证的，不需要在每个分支里各写一遍。
     */
    @Transactional(rollbackFor = Exception.class)
    public Long createSale(PosSale sale, List<PosSaleItem> items) {
        saleMapper.insert(sale);
        for (PosSaleItem it : items) {
            it.setSaleId(sale.getId());
            saleItemMapper.insert(it);
        }
        return sale.getId();
    }

    /**
     * 结算：出库 + （挂账）生成应收 + 收款状态落定。
     *
     * <p><b>幂等</b>：只有仍处于 {@code PAYING} 的单才会真正执行出库。
     * 重复回调、回调与轮询同时命中，都只会出一次库 —— 重复出库等于凭空发货。
     *
     * @param payStatus       PAID（已收款）/ UNPAID（挂账未收）
     * @param channelTradeNo  渠道交易号（现金/挂账传 null）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> settle(Long saleId, String payStatus, String channelTradeNo) {
        PosSale sale = saleMapper.selectById(saleId);
        if (sale == null) {
            throw new IllegalStateException("销售单不存在：" + saleId);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("saleNo", sale.getSaleNo());
        out.put("totalAmount", sale.getTotalAmount());

        if ("PAID".equals(sale.getPayStatus()) || "UNPAID".equals(sale.getPayStatus())) {
            log.info("[POS] 单据已结算，跳过重复出库 saleNo={} payStatus={}", sale.getSaleNo(), sale.getPayStatus());
            out.put("payStatus", sale.getPayStatus());
            out.put("outstockNo", sale.getOutstockNo());
            out.put("alreadySettled", true);
            return out;
        }
        if ("CANCELLED".equals(sale.getPayStatus())) {
            // 已取消却又收到钱：必须让人看到，钱在渠道账上，需要人工退款
            throw new IllegalStateException("销售单已取消，但收到支付成功通知，请核对渠道账单后处理退款："
                    + sale.getSaleNo());
        }

        List<PosSaleItem> items = saleItemMapper.selectList(new LambdaQueryWrapper<PosSaleItem>()
                .eq(PosSaleItem::getSaleId, saleId));
        List<String> outstockNos = new ArrayList<>();
        for (PosSaleItem it : items) {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("skuCode", it.getSkuCode());
            params.put("quantity", it.getQuantity());
            params.put("outstockType", "free_outbound");
            params.put("customerName", sale.getCustomerName());
            params.put("customerPhone", sale.getCustomerPhone());
            params.put("remark", "收银台 " + sale.getSaleNo());
            var os = finishedWarehouseOperationOrchestrator.freeOutbound(params);
            if (os != null && StringUtils.hasText(os.getOutstockNo())) {
                outstockNos.add(os.getOutstockNo());
            }
        }

        // 只有挂账才生成应收：当场收款生成应收 = 同一笔钱在「已收」与「应收未收」里各记一次
        String receivableId = null;
        if ("UNPAID".equals(payStatus) && "CREDIT".equals(sale.getPayMethod())) {
            Receivable receivable = new Receivable();
            receivable.setCustomerId(sale.getCustomerId());
            receivable.setCustomerName(sale.getCustomerName());
            receivable.setAmount(sale.getTotalAmount());
            receivable.setDescription("收银台销售单 " + sale.getSaleNo());
            Receivable saved = receivableOrchestrator.create(receivable);
            receivableId = saved.getId();
        }

        PosSale patch = new PosSale();
        patch.setId(saleId);
        patch.setPayStatus(payStatus);
        patch.setChannelTradeNo(StringUtils.hasText(channelTradeNo) ? channelTradeNo : null);
        patch.setPaidTime("PAID".equals(payStatus) ? LocalDateTime.now() : null);
        patch.setReceivableId(receivableId);
        if (!outstockNos.isEmpty()) {
            patch.setOutstockNo(outstockNos.get(0)
                    + (outstockNos.size() > 1 ? " 等" + outstockNos.size() + "单" : ""));
        }
        saleMapper.updateById(patch);

        log.info("[POS] 结算完成 saleNo={} 方式={} 状态={} 金额={} 出库={}单 应收={}",
                sale.getSaleNo(), sale.getPayMethod(), payStatus, sale.getTotalAmount(),
                outstockNos.size(), receivableId);
        out.put("payStatus", payStatus);
        out.put("outstockNo", patch.getOutstockNo());
        out.put("receivableId", receivableId);
        out.put("itemCount", sale.getItemCount());
        return out;
    }

    /**
     * 置为已取消（未出库，仅释放单据）。
     *
     * <p>只在 {@code PAYING} 时生效：已收款/挂账的单不能悄悄取消（钱的事必须走退款/红冲）。
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean markCancelled(Long saleId, String reason) {
        PosSale sale = saleMapper.selectById(saleId);
        if (sale == null || !"PAYING".equals(sale.getPayStatus())) {
            return false;
        }
        PosSale patch = new PosSale();
        patch.setId(saleId);
        patch.setPayStatus("CANCELLED");
        patch.setRemark(appendRemark(sale.getRemark(),
                StringUtils.hasText(reason) ? reason : "支付未完成，已取消"));
        saleMapper.updateById(patch);
        log.info("[POS] 单据已取消 saleNo={} 原因={}", sale.getSaleNo(), reason);
        return true;
    }

    private static String appendRemark(String old, String add) {
        if (!StringUtils.hasText(old)) {
            return add;
        }
        return old + "｜" + add;
    }
}
