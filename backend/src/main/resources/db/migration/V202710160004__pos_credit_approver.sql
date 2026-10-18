-- D-817：挂账授权人标记
--
-- 为什么要做：挂账（Credit）是**唯一不收到钱就能出单**的支付方式。
-- 此前任何收银员都能直接挂账，事后对账才发现钱没回来，
-- 甚至可以挂账走掉再核销抹平 —— 这是收银环节最典型的资损口子。
--
-- 现在：开挂账单必须由「挂账授权人」输入账号密码确认，
-- 授权人 = 租户主账号 或 本字段勾选为 1 的用户（通常是店长/财务）。
-- 不引入新的角色权限体系：角色权限模型管的是「能不能进这个功能」，
-- 而这里管的是「这笔单要不要有人签字」，语义不同，混在一起会互相污染。
--
-- 幂等：用 INFORMATION_SCHEMA 判断列是否存在。
-- 每条语句写成**单行**，避免多行字符串里单引号配对出错
-- （V202710160003 就是因为多行 + 行尾多一个单引号炸过一次）。

SET @ddl := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_user'
       AND COLUMN_NAME = 'pos_credit_approver') = 0,
  'ALTER TABLE `t_user` ADD COLUMN `pos_credit_approver` TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''是否可授权挂账(店长/财务)''',
  'DO 0'
);
PREPARE s FROM @ddl;
EXECUTE s;
DEALLOCATE PREPARE s;
