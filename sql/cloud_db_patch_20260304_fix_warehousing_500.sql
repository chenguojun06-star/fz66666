-- =====================================================================
-- 云端补丁：修复入库扫码"系统内部错误"(HTTP 500)
-- 执行方式：微信云托管控制台 → 数据库面板 → 每条 ALTER TABLE 独立执行
--
-- 根本原因：
--   WarehouseScanExecutor.execute()（第171-178行）向 t_product_warehousing
--   写入 warehousing_operator_id 等字段，但云端 DB 的 t_product_warehousing
--   表由 init.sql 建立，缺少这些列。
--   INSERT 失败 → BadSqlGrammarException（"Unknown column 'warehousing_operator_id'"）
--   → catch(DuplicateKeyException) 不捕获 → GlobalExceptionHandler → "系统内部错误"
--
-- 执行须知：
--   - 若某列已存在，ALTER TABLE 会报 "Duplicate column name"，忽略即可
--   - 建议在业务低峰期（凌晨）执行，DDL 会加表级锁（毫秒级）
-- =====================================================================

-- 1. 入库开始时间
ALTER TABLE t_product_warehousing
    ADD COLUMN warehousing_start_time DATETIME DEFAULT NULL COMMENT '入库开始时间';

-- 2. 入库完成时间
ALTER TABLE t_product_warehousing
    ADD COLUMN warehousing_end_time DATETIME DEFAULT NULL COMMENT '入库完成时间';

-- 3. 入库人员ID（WarehouseScanExecutor 第 171 行设置）
ALTER TABLE t_product_warehousing
    ADD COLUMN warehousing_operator_id VARCHAR(64) DEFAULT NULL COMMENT '入库人员ID';

-- 4. 入库人员姓名（WarehouseScanExecutor 第 176 行设置）
ALTER TABLE t_product_warehousing
    ADD COLUMN warehousing_operator_name VARCHAR(128) DEFAULT NULL COMMENT '入库人员姓名';

-- 5. 质检人员ID（WarehouseScanExecutor 第 173 行设置）
ALTER TABLE t_product_warehousing
    ADD COLUMN quality_operator_id VARCHAR(64) DEFAULT NULL COMMENT '质检人员ID';

-- 6. 质检人员姓名（WarehouseScanExecutor 第 178 行设置）
ALTER TABLE t_product_warehousing
    ADD COLUMN quality_operator_name VARCHAR(128) DEFAULT NULL COMMENT '质检人员姓名';

-- 7. 租户ID（Spring Boot AutoFill 自动写入）
ALTER TABLE t_product_warehousing
    ADD COLUMN tenant_id BIGINT DEFAULT NULL COMMENT '租户ID';

-- 8. 租户ID 索引（可选，若索引已存在忽略）
ALTER TABLE t_product_warehousing
    ADD INDEX idx_warehousing_tenant_id (tenant_id);

-- =====================================================================
-- 验证：执行完毕后，运行以下 SELECT 确认所有列存在
-- =====================================================================
-- SELECT COLUMN_NAME
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME = 't_product_warehousing'
--   AND COLUMN_NAME IN (
--     'warehousing_start_time','warehousing_end_time',
--     'warehousing_operator_id','warehousing_operator_name',
--     'quality_operator_id','quality_operator_name',
--     'tenant_id'
--   );
-- 期望返回 7 行
