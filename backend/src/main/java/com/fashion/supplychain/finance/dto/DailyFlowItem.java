package com.fashion.supplychain.finance.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * D-245：每日经营流水统一行模型。
 * <p>
 * 把六类业务拉平成同一种结构，供前端「每日流水」大表按时间倒序展示：
 * <ul>
 *   <li>SCAN — 生产扫码（t_scan_record）</li>
 *   <li>PURCHASE — 物料采购（t_material_purchase）</li>
 *   <li>MATERIAL_INBOUND — 物料入库（t_material_inbound）</li>
 *   <li>MATERIAL_OUTBOUND — 物料出库（t_material_outbound_log）</li>
 *   <li>PRODUCT_INBOUND — 成品入库（t_product_warehousing）</li>
 *   <li>PRODUCT_OUTSTOCK — 成品出库（t_product_outstock）</li>
 * </ul>
 *
 * <p><b>金额口径注意</b>：物料出库（t_material_outbound_log）表上<strong>没有金额字段</strong>，
 * 其 {@code amount} 恒为 {@code null}。前端必须显示为「—」而不是 0，
 * 否则对账时会误以为该笔金额为 0。
 */
@Data
public class DailyFlowItem {

    /** 业务类型编码（见类注释六类） */
    private String bizType;

    /** 业务类型名称（中文，直接展示） */
    private String bizTypeLabel;

    /** 流水单号 */
    private String flowNo;

    /** 流水时间（业务发生时间，非创建时间） */
    private LocalDateTime flowTime;

    /** 关联对象（供应商 / 客户 / 工厂） */
    private String relatedName;

    /** 款号 */
    private String styleNo;

    /** 订单号 */
    private String orderNo;

    /** 物料名称（采购 / 物料出入库时才有） */
    private String materialName;

    /** 工序名（生产扫码时才有） */
    private String processName;

    /** 数量 */
    private BigDecimal quantity;

    /** 金额；该业务无金额来源时为 null（不是 0） */
    private BigDecimal amount;

    /** 操作人 */
    private String operatorName;
}
