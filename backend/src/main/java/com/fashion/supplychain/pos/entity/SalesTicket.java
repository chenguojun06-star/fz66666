package com.fashion.supplychain.pos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 电子小票 —— 销售单据（POS 收银 / C端店铺订单 / 批发销售出库）的统一扫码凭证。
 *
 * <p>一张销售单据对应一张小票（{@code uk_ticket_biz} 幂等）。小票不复制业务数据，
 * 聚合时实时查源单据；{@code sign_token} 是免登录扫码凭证，公开接口按行取
 * {@code tenant_id} 注入聚合查询（P0 铁律 4）。
 */
@Data
@TableName("t_sales_ticket")
public class SalesTicket {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** 小票号 T+日期+当日序号 */
    private String ticketNo;

    /** 来源单据类型：POS_SALE / SHOP_ORDER / OUTSTOCK */
    private String sourceBizType;

    /** 来源单据ID（ShopOrder 为 UUID，故用 String） */
    private String sourceBizId;

    /** 来源单据号（列表展示用） */
    private String sourceBizNo;

    /** 扫码凭证（Base64url 随机 43 位） */
    private String signToken;

    /** UNSIGNED 未签收 / SIGNED 已签收 / VOID 已作废 */
    private String status;

    private LocalDateTime signedTime;

    /** 签收人（客户自填姓名） */
    private String signedBy;

    private Integer viewCount;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
