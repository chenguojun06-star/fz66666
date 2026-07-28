package com.fashion.supplychain.finance.constant;

/**
 * 账单聚合（BillAggregation）统一常量
 * <p>
 * 用途：替代散落在各 Orchestrator 中的硬编码字符串，集中管理账单类型/分类/状态/来源类型/对方类型。
 * <p>
 * 设计原则：
 * 1. 字段在 DB 中仍为 VARCHAR，本类仅作为代码层常量，不破坏现有 API 契约
 * 2. 调用方仍可传入 String 字面量，但推荐改用本类常量以避免拼写错误
 * 3. 新增来源类型/分类时只需在此追加常量，避免遗漏
 * <p>
 * 关联铁律：P0 #4 多租户隔离 / D-022 财务数据链路闭环
 */
public final class BillConstants {

    private BillConstants() {}

    // ==================== 账单类型 billType ====================

    /** 应付账单 */
    public static final String BILL_TYPE_PAYABLE = "PAYABLE";
    /** 应收账单 */
    public static final String BILL_TYPE_RECEIVABLE = "RECEIVABLE";

    // ==================== 账单分类 billCategory ====================

    /** 物料采购 */
    public static final String CATEGORY_MATERIAL = "MATERIAL";
    /** 成品出库/退货 */
    public static final String CATEGORY_PRODUCT = "PRODUCT";
    /** 外发工厂加工 */
    public static final String CATEGORY_EXTERNAL_FACTORY = "EXTERNAL_FACTORY";
    /** 工资结算 */
    public static final String CATEGORY_PAYROLL = "PAYROLL";
    /** 费用报销 */
    public static final String CATEGORY_EXPENSE = "EXPENSE";
    /** 销售出货 */
    public static final String CATEGORY_SHIPMENT = "SHIPMENT";
    /** 扣款 */
    public static final String CATEGORY_DEDUCTION = "DEDUCTION";
    /** 盘盈 */
    public static final String CATEGORY_INVENTORY_PROFIT = "INVENTORY_PROFIT";
    /** 盘亏 */
    public static final String CATEGORY_INVENTORY_LOSS = "INVENTORY_LOSS";

    // ==================== 账单状态 status ====================

    /** 待确认 */
    public static final String STATUS_PENDING = "PENDING";
    /** 已确认 */
    public static final String STATUS_CONFIRMED = "CONFIRMED";
    /** 结算中 */
    public static final String STATUS_SETTLING = "SETTLING";
    /** 已结清 */
    public static final String STATUS_SETTLED = "SETTLED";
    /** 已取消 */
    public static final String STATUS_CANCELLED = "CANCELLED";

    // ==================== 来源类型 sourceType ====================

    /** 物料对账 */
    public static final String SOURCE_MATERIAL_RECONCILIATION = "MATERIAL_RECONCILIATION";
    /** 工资结算 */
    public static final String SOURCE_PAYROLL_SETTLEMENT = "PAYROLL_SETTLEMENT";
    /** 销售出货对账 */
    public static final String SOURCE_SHIPMENT_RECONCILIATION = "SHIPMENT_RECONCILIATION";
    /** 销售出货扣款 */
    public static final String SOURCE_SHIPMENT_RECONCILIATION_DEDUCTION = "SHIPMENT_RECONCILIATION_DEDUCTION";
    /** 费用报销 */
    public static final String SOURCE_EXPENSE_REIMBURSEMENT = "EXPENSE_REIMBURSEMENT";
    /** 电商销售收入 */
    public static final String SOURCE_EC_SALES_REVENUE = "EC_SALES_REVENUE";
    /** 销售退货 */
    public static final String SOURCE_SALES_RETURN = "SALES_RETURN";
    /** 采购退货 */
    public static final String SOURCE_PURCHASE_RETURN = "PURCHASE_RETURN";
    /** 样衣开发费用 */
    public static final String SOURCE_STYLE_DEVELOPMENT = "STYLE_DEVELOPMENT";
    /** 二次工艺 */
    public static final String SOURCE_SECONDARY_PROCESS = "SECONDARY_PROCESS";
    /** 成品出库 */
    public static final String SOURCE_PRODUCT_OUTSTOCK = "PRODUCT_OUTSTOCK";
    /** 成品出库冲销 */
    public static final String SOURCE_PRODUCT_OUTSTOCK_REVERSAL = "PRODUCT_OUTSTOCK_REVERSAL";
    /** 盘点盘盈 */
    public static final String SOURCE_INVENTORY_PROFIT = "INVENTORY_PROFIT";
    /** 盘点盘亏 */
    public static final String SOURCE_INVENTORY_LOSS = "INVENTORY_LOSS";
    /** 采购出库（领料） */
    public static final String SOURCE_PURCHASE_PICKING = "PURCHASE_PICKING";
    /** 员工借支 */
    public static final String SOURCE_EMPLOYEE_ADVANCE = "EMPLOYEE_ADVANCE";
    /** 面辅料领取应收（外发工厂领料） */
    public static final String SOURCE_MATERIAL_PICKUP = "MATERIAL_PICKUP";

    // ==================== 对方类型 counterpartyType ====================

    /** 供应商 */
    public static final String COUNTERPARTY_SUPPLIER = "SUPPLIER";
    /** 客户 */
    public static final String COUNTERPARTY_CUSTOMER = "CUSTOMER";
    /** 工人 */
    public static final String COUNTERPARTY_WORKER = "WORKER";
    /** 工厂 */
    public static final String COUNTERPARTY_FACTORY = "FACTORY";
    /** 员工 */
    public static final String COUNTERPARTY_EMPLOYEE = "EMPLOYEE";
    /** 内部 */
    public static final String COUNTERPARTY_INTERNAL = "INTERNAL";

    // ==================== 便捷判断 ====================

    public static boolean isPayable(String billType) {
        return BILL_TYPE_PAYABLE.equalsIgnoreCase(billType);
    }

    public static boolean isReceivable(String billType) {
        return BILL_TYPE_RECEIVABLE.equalsIgnoreCase(billType);
    }

    public static boolean isTerminalStatus(String status) {
        return STATUS_SETTLED.equals(status) || STATUS_CANCELLED.equals(status);
    }

    public static boolean isConfirmedGroup(String status) {
        return STATUS_CONFIRMED.equals(status) || STATUS_SETTLING.equals(status);
    }
}
