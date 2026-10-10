package com.fashion.supplychain.crm.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.crm.service.CustomerService;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;

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
 *   <li>客户解析（两级，用户口径「一切以实际出库给客户为准」）：
 *     ① 关联生产订单的 customerId（与 CRM 侧同一口径：精确匹配，
 *        <b>刻意不做公司名模糊匹配</b>——历史 like 实现曾造成跨客户数据泄露 E-P0-1）；
 *     ② 订单缺失/未关联客户时（**备货直发客户**，仓库出库无订单），按出库单
 *        customerName 在客户档案内做<b>全等匹配</b>（不是 like，避免"甲公司"误挂
 *        "甲公司分公司"）；匹配到多个同名客户时告警并取第一个
 *     ③ 都匹配不到 → 跳过（真·内部出库）</li>
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

    @Autowired
    private CustomerService customerService;

    /** D-741：账期天数（出货后 N 天到期，租户可配置，默认 30） */
    @Autowired
    private com.fashion.supplychain.crm.orchestration.TenantSettingOrchestrator tenantSettingOrchestrator;

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

        // 客户解析（两级）：① 订单 customerId ② 出库单客户名全等匹配客户档案
        String customerId = null;
        ProductionOrder order = findOrder(outstock, tenantId);
        if (order != null && StringUtils.hasText(order.getCustomerId())) {
            customerId = order.getCustomerId();
        } else {
            Customer byName = resolveCustomerByExactName(outstock.getCustomerName(), tenantId);
            if (byName != null) {
                customerId = byName.getId();
                log.info("[出货应收] 订单未关联客户，按出库单客户名匹配档案: outstockNo={}, customerName={}, customerId={}",
                        outstock.getOutstockNo(), outstock.getCustomerName(), customerId);
            }
        }
        if (!StringUtils.hasText(customerId)) {
            log.info("[出货应收] 无法确定客户（订单与客户档案都未匹配到），跳过: outstockNo={}, customerName={}",
                    outstock.getOutstockNo(), outstock.getCustomerName());
            return;
        }

        Receivable r = new Receivable();
        r.setCustomerId(customerId);
        // D-800：order 可能为 null（备货直发场景没有生产订单，只能靠客户名匹配档案）。
        // 原来这里直接 order.getId() 会抛 NPE，被调用方 try-catch 吞掉 →
        // 应收单<b>静默不生成</b>，钱就这么丢了且没有任何报错。
        // 现在按实际有无填：没有订单就留空，应收单仍要生成（客户与金额都已确定）。
        if (order != null) {
            r.setOrderId(order.getId());
            r.setOrderNo(order.getOrderNo());
        }
        r.setAmount(amount);
        r.setReceivedAmount(outstock.getPaidAmount() == null ? BigDecimal.ZERO : outstock.getPaidAmount());
        // D-741：到期日 = 出库时间 + 账期天数（租户可配置，默认 30 天，读不到自动回退）
        int termDays = tenantSettingOrchestrator.getPaymentTermDays(
                outstock.getTenantId() != null ? outstock.getTenantId() : UserContext.tenantId());
        LocalDateTime base = outstock.getCreateTime() != null ? outstock.getCreateTime() : LocalDateTime.now();
        r.setDueDate(base.toLocalDate().plusDays(termDays));
        r.setDescription("成品出库自动生成（出库单 " + outstock.getOutstockNo() + "，账期 " + termDays + " 天）");
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

    /**
     * 按出库单上的客户名，在租户内<b>全等匹配</b>客户档案（备货直发客户、无订单场景）。
     *
     * <p>⚠️ 刻意用全等（eq）而非 like：like 会把「甲公司」的出库误挂到「甲公司分公司」，
     * 重蹈 E-P0-1 跨客户数据泄露的覆辙。同名多客户时告警并取第一个（同名通常即同客户）。
     */
    private Customer resolveCustomerByExactName(String customerName, Long tenantId) {
        if (!StringUtils.hasText(customerName) || tenantId == null) {
            return null;
        }
        String name = customerName.trim();
        long count = customerService.lambdaQuery()
                .eq(Customer::getCompanyName, name)
                .eq(Customer::getTenantId, tenantId)
                .eq(Customer::getDeleteFlag, 0)
                .count();
        if (count == 0) {
            return null;
        }
        if (count > 1) {
            log.warn("[出货应收] 客户档案存在 {} 个同名客户「{}」，取第一个（建议在客户档案里去重）", count, name);
        }
        return customerService.lambdaQuery()
                .eq(Customer::getCompanyName, name)
                .eq(Customer::getTenantId, tenantId)
                .eq(Customer::getDeleteFlag, 0)
                .orderByAsc(Customer::getCreateTime)
                .last("LIMIT 1")
                .one();
    }
}
