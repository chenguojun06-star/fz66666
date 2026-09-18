-- V202709181900: 品质异常数量支持小数（物料按米/码/公斤计，整数会丢失）
-- 背景：面料品质异常常按米记（如 1.5 米有问题），INT 列会把 1.5 存成 1（或前端根本填不进去），
--       导致后续「异常数量回退到货量 / 生成补料采购单 / 异常金额」全部按错的数字算。
-- 与 D-410/D-466 小数链路同一口径：物料侧一律 DECIMAL(12,4)，成衣件数保持 INT。

ALTER TABLE `t_material_quality_issue`
    MODIFY COLUMN `issue_quantity` DECIMAL(12, 4) DEFAULT 0 COMMENT '异常数量（支持小数，物料按米/码/公斤计）';
