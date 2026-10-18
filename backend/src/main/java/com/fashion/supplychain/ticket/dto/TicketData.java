package com.fashion.supplychain.ticket.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 电子小票聚合数据（免登录 H5 与前端弹窗共用同一份 DTO）。
 *
 * <p>只输出对客户可见的信息（成交价、数量、收款/应收状态），
 * <b>绝不输出</b>成本价、利润、供应商等内部字段。
 */
@Data
public class TicketData {

    private String ticketNo;

    /**
     * 免登录扫码凭证（Base64url 43 位随机）。
     *
     * <p>D-811 接手时补上：{@code SalesTicket} 实体与 {@code sign_token} 迁移列
     * 都有这个字段，{@code TicketAssembler} 也在 setSignToken，但 DTO 漏了字段，
     * 导致整个后端编译不过（并行开发的收银台/小票 WIP 卡在这里）。
     *
     * <p><b>安全提醒</b>：这是**免登录凭证**，等同该小票的访问权。
     * 只应出现在「持有者本人打开自己的小票」的场景，
     * 绝不能拼进分享链接以外的场景、更不能写进日志或导出文件。
     */
    private String signToken;


    /** UNSIGNED / SIGNED / VOID */
    private String status;

    private LocalDateTime signedTime;

    private String signedBy;

    /** 来源单据类型：POS_SALE / SHOP_ORDER / OUTSTOCK */
    private String sourceBizType;

    private String sourceBizNo;

    /** 开单时间 */
    private LocalDateTime createTime;

    private String customerName;

    /**
     * 客户手机号 —— <b>已掩码</b>（138****8888）。
     *
     * <p>为什么掩码（P1-3，2026-10-17）：小票是<b>永久有效、免登录</b>的公开 URL，
     * 而 token 只是"不可遍历"、并非"不会泄露"（截图转发、聊天记录都可能带出 URL）。
     * 在这个入口上回完整手机号属于不必要的 PII 暴露：顾客要联系商家时
     * 掩码号已够确认身份，完整号码商家在自己的订单/应收里随时能看。
     */
    private String customerPhone;

    /** 店员/开单人（收银员 / 出库经办） */
    private String serverName;

    private List<TicketItemData> items;

    /**
     * 颜色 × 码数数量矩阵：[{color:"牛仔蓝", sizes:{"M":1,"L":2}}]（保序）
     */
    private List<Map<String, Object>> matrix;

    private Integer itemCount;

    /** 商品金额（折前；OUTSTOCK 场景 = 出库金额） */
    private BigDecimal goodsAmount;

    private BigDecimal discountAmount;

    /** 运费（店铺订单有，其余为 null） */
    private BigDecimal shippingFee;

    private BigDecimal totalAmount;

    /** 收款方式原始值（CASH/WECHAT/ALIPAY/CARD/CREDIT，前端翻译中文） */
    private String payMethod;

    /** 收款/出库状态原始值（POS: PAID/PAYING/UNPAID/CANCELLED；OUTSTOCK: paymentStatus） */
    private String payStatus;

    /** 订单状态（店铺订单：PENDING_SHIP/SHIPPED/CANCELLED，其余为 null） */
    private String orderStatus;

    private LocalDateTime paidTime;

    /** 挂账应收汇总（无应收为 null） */
    private BigDecimal receivableAmount;

    private BigDecimal receivableReceived;

    private String remark;
}
