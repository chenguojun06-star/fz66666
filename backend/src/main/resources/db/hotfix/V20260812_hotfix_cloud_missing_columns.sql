-- =====================================================================
-- 云端数据库一键修复脚本（幂等，可重复执行）
-- 生成日期：2026-08-12
-- 背景：云端 Flyway 迁移未完整执行，导致多个字段缺失，引发：
--   1. P1: ScanRecordMapper.selectPayrollAggregation 报 "setting parameters" 错误
--        （t_scan_record 缺 process_unit_price 等字段）
--   2. P2: AiConversationMemoryMapper.findArchivableBatchDegraded 报 "Unknown column memory_summary"
--   3. P2: 其他可能缺失的字段（预防性补齐）
-- 用法：直接在云端 MySQL 执行整段脚本，已做幂等处理，重复执行不会报错
-- 注意：本脚本使用 DELIMITER $$ 切换分隔符以正确定义存储过程
-- =====================================================================

-- 切换分隔符为 $$，以便存储过程体内的 ; 不会被当作语句结束
DELIMITER $$

-- ---------------------------------------------------------------------
-- 工具存储过程：按需添加列（MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS）
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS safe_add_column $$
CREATE PROCEDURE safe_add_column(
    IN p_table  VARCHAR(64),
    IN p_column VARCHAR(64),
    IN p_def    VARCHAR(500)
)
BEGIN
    DECLARE col_count INT;
    SELECT COUNT(*) INTO col_count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND COLUMN_NAME  = p_column;
    IF col_count = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_def);
        PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
        SELECT CONCAT('[OK] ', p_table, '.', p_column, ' 已添加') AS log_msg;
    ELSE
        SELECT CONCAT('[SKIP] ', p_table, '.', p_column, ' 已存在') AS log_msg;
    END IF;
END$$

-- ---------------------------------------------------------------------
-- 【P1 最急】t_scan_record 补字段
-- 修复：ScanRecordMapper.selectPayrollAggregation SQL 报错
-- 原因：SQL 引用 sr.process_unit_price / sr.scan_cost / sr.payroll_settlement_id 等
-- ---------------------------------------------------------------------
CALL safe_add_column('t_scan_record', 'process_unit_price',
    "DECIMAL(15,2) DEFAULT NULL COMMENT '工序单价'")$$
CALL safe_add_column('t_scan_record', 'scan_cost',
    "DECIMAL(15,2) DEFAULT NULL COMMENT '扫码工序成本'")$$
CALL safe_add_column('t_scan_record', 'scan_mode',
    "VARCHAR(20) DEFAULT 'BUNDLE' COMMENT '扫码模式: ORDER/BUNDLE/SKU'")$$
CALL safe_add_column('t_scan_record', 'sku_completed_count',
    "INT DEFAULT 0 COMMENT 'SKU完成数'")$$
CALL safe_add_column('t_scan_record', 'sku_total_count',
    "INT DEFAULT 0 COMMENT 'SKU总数'")$$
CALL safe_add_column('t_scan_record', 'actual_operator_id',
    "VARCHAR(64) DEFAULT NULL COMMENT '实际操作员ID'")$$
CALL safe_add_column('t_scan_record', 'actual_operator_name',
    "VARCHAR(100) DEFAULT NULL COMMENT '实际操作员名称'")$$
CALL safe_add_column('t_scan_record', 'payroll_settlement_id',
    "VARCHAR(64) DEFAULT NULL COMMENT '工资结算单ID'")$$
CALL safe_add_column('t_scan_record', 'settlement_status',
    "VARCHAR(32) DEFAULT NULL COMMENT '结算状态'")$$
CALL safe_add_column('t_scan_record', 'confirm_time',
    "DATETIME DEFAULT NULL COMMENT '确认时间'")$$
CALL safe_add_column('t_scan_record', 'cutting_bundle_no',
    "VARCHAR(64) DEFAULT NULL COMMENT '扎号'")$$
CALL safe_add_column('t_scan_record', 'total_amount',
    "DECIMAL(15,2) DEFAULT NULL COMMENT '总金额'")$$

-- ---------------------------------------------------------------------
-- 【P2】t_ai_conversation_memory 补字段
-- 修复：AiConversationMemoryMapper.findArchivableBatchDegraded 报 "Unknown column memory_summary"
-- ---------------------------------------------------------------------
CALL safe_add_column('t_ai_conversation_memory', 'memory_summary',
    "TEXT NOT NULL COMMENT '记忆摘要'")$$
CALL safe_add_column('t_ai_conversation_memory', 'key_entities',
    "TEXT NULL COMMENT '关注的订单号/款式/工厂 JSON'")$$
CALL safe_add_column('t_ai_conversation_memory', 'importance_score',
    "INT NOT NULL DEFAULT 50 COMMENT '重要性分数'")$$
CALL safe_add_column('t_ai_conversation_memory', 'source_message_count',
    "INT NOT NULL DEFAULT 0 COMMENT '来源消息数'")$$
CALL safe_add_column('t_ai_conversation_memory', 'expire_time',
    "DATETIME NULL COMMENT '过期时间'")$$
CALL safe_add_column('t_ai_conversation_memory', 'delete_flag',
    "TINYINT NOT NULL DEFAULT 0 COMMENT '删除标记'")$$

-- 如果整张表都没有，直接建表（极端情况）
DROP PROCEDURE IF EXISTS ensure_ai_memory_table $$
CREATE PROCEDURE ensure_ai_memory_table()
BEGIN
    DECLARE tbl_count INT;
    SELECT COUNT(*) INTO tbl_count
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_conversation_memory';
    IF tbl_count = 0 THEN
        CREATE TABLE t_ai_conversation_memory (
            id                   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
            tenant_id            BIGINT       NOT NULL,
            user_id              VARCHAR(64)  NOT NULL,
            memory_summary       TEXT         NOT NULL,
            key_entities         TEXT         NULL     COMMENT '关注的订单号/款式/工厂 JSON',
            importance_score     INT          NOT NULL DEFAULT 50,
            source_message_count INT          NOT NULL DEFAULT 0,
            create_time          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expire_time          DATETIME     NULL,
            delete_flag          TINYINT      NOT NULL DEFAULT 0,
            INDEX idx_tenant_user (tenant_id, user_id),
            INDEX idx_create_time (create_time)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI对话记忆-用户级跨会话持久化';
        SELECT '[OK] t_ai_conversation_memory 表已创建' AS log_msg;
    ELSE
        SELECT '[SKIP] t_ai_conversation_memory 表已存在' AS log_msg;
    END IF;
END$$
CALL ensure_ai_memory_table()$$

-- ---------------------------------------------------------------------
-- 【预防性补齐】t_pattern_scan_record 补字段
-- ---------------------------------------------------------------------
CALL safe_add_column('t_pattern_scan_record', 'process_unit_price',
    "DECIMAL(10,4) DEFAULT NULL COMMENT '工序单价'")$$
CALL safe_add_column('t_pattern_scan_record', 'total_amount',
    "DECIMAL(12,2) DEFAULT NULL COMMENT '总金额'")$$

-- ---------------------------------------------------------------------
-- 【预防性补齐】t_style_info 补推送相关字段
-- ---------------------------------------------------------------------
CALL safe_add_column('t_style_info', 'pushed_to_order',
    "TINYINT DEFAULT 0 COMMENT '是否已推送到下单管理'")$$
CALL safe_add_column('t_style_info', 'pushed_to_order_time',
    "DATETIME DEFAULT NULL COMMENT '推送时间'")$$
CALL safe_add_column('t_style_info', 'pushed_by_name',
    "VARCHAR(100) DEFAULT NULL COMMENT '推送人'")$$
CALL safe_add_column('t_style_info', 'progress_node',
    "VARCHAR(64) DEFAULT NULL COMMENT '进度节点'")$$
CALL safe_add_column('t_style_info', 'order_type',
    "VARCHAR(64) DEFAULT NULL COMMENT '订单类型'")$$

-- ---------------------------------------------------------------------
-- 清理工具存储过程
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS safe_add_column$$
DROP PROCEDURE IF EXISTS ensure_ai_memory_table$$

-- 恢复默认分隔符为 ;
DELIMITER ;

-- ---------------------------------------------------------------------
-- 验证：列出本次补齐的关键字段是否已存在
-- ---------------------------------------------------------------------
SELECT 't_scan_record' AS tbl, COLUMN_NAME, COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record'
  AND COLUMN_NAME IN ('process_unit_price', 'scan_cost', 'payroll_settlement_id', 'settlement_status')
UNION ALL
SELECT 't_ai_conversation_memory' AS tbl, COLUMN_NAME, COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_conversation_memory'
  AND COLUMN_NAME IN ('memory_summary', 'key_entities', 'importance_score', 'expire_time')
ORDER BY tbl, COLUMN_NAME;
