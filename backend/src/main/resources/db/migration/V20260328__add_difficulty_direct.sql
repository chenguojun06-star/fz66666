-- V20260328: 直接 ALTER TABLE 添加 difficulty 列
-- V20260326/V20260327 均使用 PREPARE/EXECUTE 模式，在 Flyway 8.x + MySQL JDBC 下
-- DDL 未被实际执行（静默成功），改用直接 ALTER TABLE，单语句执行无歧义
ALTER TABLE t_style_process ADD COLUMN difficulty VARCHAR(10) DEFAULT NULL AFTER machine_type;
