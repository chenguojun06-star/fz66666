package com.fashion.supplychain.shop.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * C端店铺订单（D-763）：下单→扣库存出库→挂应收 全链的主记录。
 * 钱走「挂账应收」：客户下单即生成应收，收款在收付款中心核销（与 D-753 发票草稿自动联动）。
 */
@Data
@TableName("t_shop_order")
public class ShopOrder {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;

    /** 店铺订单号 SH+时间戳 */
    private String orderNo;

    /** 按手机号归并的 CRM 客户ID */
    private String customerId;

    private String customerName;
    private String phone;
    private String address;

    /** 订单总额（= 商品金额 + 运费；服务端按 SKU 售价计算，不信前端） */
    private BigDecimal totalAmount;

    /** 商品金额（不含运费） */
    private BigDecimal goodsAmount;

    /** 运费（配送费） */
    private BigDecimal shippingFee;

    private Integer itemCount;

    /** PENDING_SHIP待发货 / SHIPPED已发货 / CANCELLED已取消 */
    private String status;

    /** 挂账应收单ID */
    private String receivableId;

    /** 销售出库单号（多款时为首单号，其余在明细/出库台账） */
    private String outstockNo;

    /** 快递公司（发货时填写；自提/同城配送可空） */
    private String expressCompany;

    /** 快递单号（发货时填写） */
    private String expressNo;

    /** 发货时间（状态置为 SHIPPED 时写入） */
    private LocalDateTime shipTime;

    /** 取消原因（状态置为 CANCELLED 时写入，售后对账留痕） */
    private String cancelReason;

    /** 取消时间 */
    private LocalDateTime cancelTime;

    /** 售后状态：NONE / APPLIED（已登记待处理）/ APPROVED（已同意）/ REJECTED（已拒绝） */
    private String afterSaleStatus;

    /** 售后类型：REFUND_ONLY（仅退款）/ RETURN_REFUND（退货退款） */
    private String afterSaleType;

    /** 售后原因（顾客诉求） */
    private String afterSaleReason;

    /** 商家处理备注 */
    private String afterSaleRemark;

    /** 售后登记时间 */
    private LocalDateTime afterSaleTime;

    private String remark;

    private Integer deleteFlag;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
