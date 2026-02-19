-- 为用户表添加审批相关字段
ALTER TABLE `t_user` ADD COLUMN `approval_status` VARCHAR(20) NULL DEFAULT 'approved' COMMENT '审批状态: pending, approved, rejected' AFTER `status`;
ALTER TABLE `t_user` ADD COLUMN `approval_time` DATETIME NULL COMMENT '审批时间' AFTER `approval_status`;
ALTER TABLE `t_user` ADD COLUMN `approval_remark` VARCHAR(500) NULL COMMENT '审批备注' AFTER `approval_time`;

-- 为现有用户设置默认审批状态为approved
UPDATE `t_user` SET `approval_status` = 'approved' WHERE `approval_status` IS NULL;

-- 查看修改结果
SELECT `id`, `username`, `name`, `status`, `approval_status`, `approval_time` FROM `t_user` LIMIT 10;
