-- =====================================================================
-- D-513 会计凭证摘要中文化：把历史凭证里的英文码改成中文
-- =====================================================================
-- 原摘要格式：「PAYABLE/EXPENSE 李老板」（billType/billCategory 的英文枚举码）
-- 新摘要格式：「应付·费用 李老板」
--
-- 代码侧 buildSummary() 已同步改为中文（AccountingVoucherOrchestrator）；
-- 本迁移只负责把**已生成的历史凭证**（含 t_accounting_voucher 与 t_accounting_entry
-- 两份摘要）改过来，否则财务在页面上看到的仍是英文码。
--
-- 安全性：
--  1. 只处理「首段为 PAYABLE/ 或 RECEIVABLE/」的行（新格式不再匹配，天然幂等可重跑）；
--  2. 只替换**首段**（SUBSTRING_INDEX(summary,' ',1)），对方名称原样保留 ——
--     避免公司名里恰好含 PRODUCT/MATERIAL 等字样时被误替换；
--  3. 纯文本字段，不影响借贷金额与凭证结构。
-- =====================================================================

-- 1. 凭证表头摘要
UPDATE t_accounting_voucher
SET summary = CONCAT(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            SUBSTRING_INDEX(summary, ' ', 1),
            'PAYABLE/',         '应付·'),
            'RECEIVABLE/',      '应收·'),
            'EXTERNAL_FACTORY', '外发厂'),
            'INVENTORY_PROFIT', '盘盈'),
            'INVENTORY_LOSS',   '盘亏'),
            'MATERIAL',         '面料'),
            'PRODUCT',          '成品'),
            'PAYROLL',          '工资'),
            'EXPENSE',          '费用'),
            'SHIPMENT',         '成品发货'),
            'DEDUCTION',        '扣款'),
        SUBSTRING(summary, LENGTH(SUBSTRING_INDEX(summary, ' ', 1)) + 1)
    )
WHERE summary REGEXP '^(PAYABLE|RECEIVABLE)/';

-- 2. 凭证分录摘要（与表头同源，保证页面两处一致）
UPDATE t_accounting_entry
SET summary = CONCAT(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            SUBSTRING_INDEX(summary, ' ', 1),
            'PAYABLE/',         '应付·'),
            'RECEIVABLE/',      '应收·'),
            'EXTERNAL_FACTORY', '外发厂'),
            'INVENTORY_PROFIT', '盘盈'),
            'INVENTORY_LOSS',   '盘亏'),
            'MATERIAL',         '面料'),
            'PRODUCT',          '成品'),
            'PAYROLL',          '工资'),
            'EXPENSE',          '费用'),
            'SHIPMENT',         '成品发货'),
            'DEDUCTION',        '扣款'),
        SUBSTRING(summary, LENGTH(SUBSTRING_INDEX(summary, ' ', 1)) + 1)
    )
WHERE summary REGEXP '^(PAYABLE|RECEIVABLE)/';
