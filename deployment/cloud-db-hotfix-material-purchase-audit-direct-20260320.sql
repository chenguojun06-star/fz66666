-- 云端控制台直执行版热修（2026-03-20）
-- 适用场景：已通过 preflight 明确确认仅缺以下 5 个列时执行。
-- 注意：本脚本是直改版，不是幂等脚本。执行前请先确认 preflight 结果仍然只剩这 5 个缺列。

ALTER TABLE `t_material_purchase`
  ADD COLUMN `audit_status` VARCHAR(32) DEFAULT NULL COMMENT '初审状态: pending_audit=待初审 passed=初审通过 rejected=初审驳回';

ALTER TABLE `t_material_purchase`
  ADD COLUMN `audit_reason` VARCHAR(500) DEFAULT NULL COMMENT '初审驳回原因';

ALTER TABLE `t_material_purchase`
  ADD COLUMN `audit_time` DATETIME DEFAULT NULL COMMENT '初审操作时间';

ALTER TABLE `t_material_purchase`
  ADD COLUMN `audit_operator_id` VARCHAR(64) DEFAULT NULL COMMENT '初审操作人ID';

ALTER TABLE `t_material_purchase`
  ADD COLUMN `audit_operator_name` VARCHAR(100) DEFAULT NULL COMMENT '初审操作人姓名';
