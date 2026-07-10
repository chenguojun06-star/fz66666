-- V20260710001: 为 t_ai_long_memory 添加双时态字段（valid_from / invalid_at）
-- Gen2 → Gen2.5 记忆冲突消解升级
-- 参考 Zep Graphiti 双时态知识图设计

DELIMITER //

DROP PROCEDURE IF EXISTS add_bitemporal_columns_to_ai_long_memory //
CREATE PROCEDURE add_bitemporal_columns_to_ai_long_memory()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = 't_ai_long_memory'
        AND column_name = 'valid_from'
    ) THEN
        ALTER TABLE t_ai_long_memory
            ADD COLUMN valid_from DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '事实生效时间（双时态）',
            ADD COLUMN invalid_at DATETIME DEFAULT NULL COMMENT '事实失效时间（NULL=当前有效）',
            ADD COLUMN fact_key VARCHAR(256) DEFAULT NULL COMMENT '事实唯一键（subjectType:subjectId:predicate），用于冲突消解';

        ALTER TABLE t_ai_long_memory
            ADD INDEX idx_tenant_fact_key (tenant_id, fact_key(64)),
            ADD INDEX idx_valid_invalid (valid_from, invalid_at);
    END IF;
END //

CALL add_bitemporal_columns_to_ai_long_memory() //
DROP PROCEDURE IF EXISTS add_bitemporal_columns_to_ai_long_memory //

DELIMITER ;
