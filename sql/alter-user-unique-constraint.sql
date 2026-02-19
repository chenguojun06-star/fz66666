-- ========================================
-- 用户名唯一约束改造：全局唯一 → 租户内唯一
-- ========================================
-- 背景：多租户架构下，不同公司的用户可以使用相同用户名
-- 例如：张记服装厂的 admin 和 李氏纺织的 admin 是不同账号
--
-- ⚠️ 执行前请先备份数据库：
-- docker exec fashion-mysql-simple mysqldump -uroot -pchangeme fashion_supplychain > backup_before_uk_change.sql
--
-- 执行方式：
-- docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain < sql/alter-user-unique-constraint.sql

-- 1. 检查当前是否存在重复用户名（同租户下）
SELECT username, tenant_id, COUNT(*) as cnt
FROM t_user
WHERE tenant_id IS NOT NULL
GROUP BY username, tenant_id
HAVING cnt > 1;

-- 2. 删除旧的全局唯一约束
ALTER TABLE t_user DROP INDEX `username`;

-- 3. 创建新的联合唯一约束（租户内唯一）
ALTER TABLE t_user ADD UNIQUE INDEX `uk_username_tenant` (`username`, `tenant_id`);

-- 4. 验证新约束
SHOW INDEX FROM t_user WHERE Key_name = 'uk_username_tenant';

SELECT '唯一约束改造完成：username + tenant_id 联合唯一' AS result;
