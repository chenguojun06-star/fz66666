-- D-775：t_factory.daily_capacity 默认值 500 → NULL（NULL = 未配置）
-- 背景：历史列默认 500，代码用 !=500 判"是否已配置"，导致两个问题：
--   1) 用户真实日产能恰好 500 时被误判为未配置（配置产能功能形同虚设）
--   2) 存量工厂全为默认 500（从未配置），capacitySource 恒为 none
-- 方案：改为 NULL=未配置 的可空语义；存量 500 是历史默认值（在原 !=500 判定下本就按未配置生效），置 NULL 与原行为全局等价，无数据损失。
-- 注意：改后用户显式填写的 500 将被正确识别为"已配置"。

-- 1) 改列默认值（MODIFY COLUMN 天然幂等，重复执行结果一致；已核实云端 INFORMATION_SCHEMA 中该列存在、IS_NULLABLE=YES）
ALTER TABLE `t_factory`
    MODIFY COLUMN `daily_capacity` INT DEFAULT NULL COMMENT '工厂日产能（件/天），NULL=未配置，用于AI排产建议';

-- 2) 存量历史默认值 500 置 NULL（UPDATE 带 WHERE，幂等：执行后无 500 可更新）
UPDATE `t_factory` SET `daily_capacity` = NULL WHERE `daily_capacity` = 500;
