package com.fashion.supplychain.crm.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;

/**
 * 销售出货 → 应收账款 自动生成（D-733）
 *
 * <p><b>为什么需要它：</b>此前「发货 → 应收」链路**完全没有自动打通**——
 * 生产库实测：`t_product_outstock` 有 5 笔销售出货（客户「合生」、各 ¥232,800），
 * 但 `t_receivable` **长期 0 行**。原因是应收只能靠人工产生：
 * 要么在「财务管理 → 成品结算」手工建"销售出货"对账单（其创建接口无任何内部调用方），
 * 要么在客户管理里手工登记。用户拍板改为**发货即自动生成应收**。
 *
 * <p><b>生成规则</b>
 * <ul>
 *   <li>仅 `outstockType=shipment`（销售出货）；调拨 transfer_out / 损耗 damage_out /
 *       样品 sample_out / 其他 other_out **一律不产生应收**</li>
 *   <li>金额取 `totalAmount`，必须 &gt; 0</li>
 *   <li>客户取**关联生产订单的 customerId**（与 CRM 侧同一口径：精确匹配，
 *       <b>刻意不做公司名模糊匹配</b>——历史 like 实现曾造成跨客户数据泄露 E-P0-1）</li>
 *   <li>订单无客户则跳过（内部单）</li>
 *   <li><b>幂等</b>：由 {@link ReceivableOrchestrator#create} 按
 *       {@code sourceBizType + sourceBizId} 查重，重复调用（重放/重复提交/补跑）
 *       不会产生第二张应收单</li>
 * </ul>
 *
 * <p><b>调用方必须自行 try-catch</b>：应收生成失败绝不能影响出库主流程
 * ——出库是仓库作业，不能因财务侧异常而失败（与 {@code WebhookPushHelper} 同风格）。
 *
 * <p><b>已知边界（未覆盖，留待后续）</b>：
 * ① 红字/反冲出库（{@code ProductOutstockOrchestrator.reverse} 生成的 RV 单）
 *    目前**不会反向冲销**对应应收；
 * ② 出库时若已有收款（{@code paidAmount > 0}），本方法会写入 receivedAmount，
 *    但状态仍由 create() 统一置为 PENDING（实际业务中出库时 paidAmount 恒为 0）。
 */
@Slf4j
@Component
public class OutstockReceivableHelper {

    /** 唯一应产生应收的成品出库类型 */
    private static final String TYPE_SHIPMENT = "shipment";

    /** 来源业务标识，写入 {@code Receivable.sourceBizType} 并作为幂等键之一 */
    public static final String SOURCE_BIZ_TYPE = "PRODUCT_OUTSTOCK";

    @Autowired
    private ReceivableOrchestrator receivableOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    /**
     * 若该出库单为「销售出货」，自动生成一张应收账款（幂等、非阻塞）。
     *
     * @param outstock 已落库的出库单（需有 id）
     */
    public void createForShipment(ProductOutstock outstock) {
        if (outstock == null || !StringUtils.hasText(outstock.getId())) {
            return;
        }
        if (!TYPE_SHIPMENT.equalsIgnoreCase(String.valueOf(outstock.getOutstockType()))) {
            return;
        }
        BigDecimal amount = outstock.getTotalAmount();
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }

        Long tenantId = UserContext.tenantId();
        ProductionOrder order = findOrder(outstock, tenantId);
        if (order == null || !StringUtils.hasText(order.getCustomerId())) {
            log.info("[出货应收] 订单未关联客户，跳过自动应收: outstockNo={}, orderNo={}",
                    outstock.getOutstockNo(), outstock.getOrderNo());
            return;
        }

        Receivable r = new Receivable();
        r.setCustomerId(order.getCustomerId());
        r.setOrderId(order.getId());
        r.setOrderNo(order.getOrderNo());
        r.setAmount(amount);
        r.setReceivedAmount(outstock.getPaidAmount() == null ? BigDecimal.ZERO : outstock.getPaidAmount());
        r.setDescription("成品出库自动生成（出库单 " + outstock.getOutstockNo() + "）");
        r.setSourceBizType(SOURCE_BIZ_TYPE);
        r.setSourceBizId(outstock.getId());
        r.setSourceBizNo(outstock.getOutstockNo());

        // create() 内部已按 sourceBizType+sourceBizId 查重：已存在则原样返回，不重复建单
        Receivable saved = receivableOrchestrator.create(r);
        log.info("[出货应收] 自动生成应收: receivableNo={}, outstockNo={}, amount={}",
                saved == null ? null : saved.getReceivableNo(), outstock.getOutstockNo(), amount);
    }

    /** 按订单 id 优先、其次订单号，在租户内取关联生产订单。 */
    private ProductionOrder findOrder(ProductOutstock outstock, Long tenantId) {
        LambdaQueryWrapper<ProductionOrder> w = new LambdaQueryWrapper<>();
        w.eq(ProductionOrder::getDeleteFlag, 0);
        if (StringUtils.hasText(outstock.getOrderId())) {
            w.eq(ProductionOrder::getId, outstock.getOrderId());
        } else if (StringUtils.hasText(outstock.getOrderNo())) {
            w.eq(ProductionOrder::getOrderNo, outstock.getOrderNo());
        } else {
            return null;
        }
        if (tenantId != null) {
            w.eq(ProductionOrder::getTenantId, tenantId);
        }
        return productionOrderService.getOne(w.last("LIMIT 1"));
    }
}
