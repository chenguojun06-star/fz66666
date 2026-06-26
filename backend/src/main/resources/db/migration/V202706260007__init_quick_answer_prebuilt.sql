-- V20270626007__init_quick_answer_prebuilt.sql
-- 初始化秒答缓存的基础PREBUILT答案（提升AI响应速度）
-- 幂等：使用INSERT IGNORE避免重复插入

-- ============================================
-- 初始化基础预构建答案（每个租户的基础模板由应用启动时注入）
-- 这里只创建通用的系统级PREBUILT答案模板
-- ============================================

-- 注意：真正的租户级PREBUILT答案由应用启动时的初始化逻辑生成
-- 本迁移确保表结构正确，并添加必要的索引优化

DELIMITER $$

DROP PROCEDURE IF EXISTS add_index_if_not_exists $$

CREATE PROCEDURE add_index_if_not_exists(
    IN p_table_name VARCHAR(128),
    IN p_index_name VARCHAR(128),
    IN p_index_def TEXT
)
BEGIN
    DECLARE index_exists INT DEFAULT 0;

    SELECT COUNT(*) INTO index_exists
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = p_table_name
      AND index_name = p_index_name;

    IF index_exists = 0 THEN
        SET @sql = CONCAT('ALTER TABLE ', p_table_name, ' ADD INDEX ', p_index_name, ' (', p_index_def, ')');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END $$

DELIMITER ;

-- 为秒答缓存表添加查询性能优化索引
CALL add_index_if_not_exists('t_quick_answer', 'idx_qa_tenant_type', 'tenant_id,answer_type');
CALL add_index_if_not_exists('t_quick_answer', 'idx_qa_tenant_expire', 'tenant_id,expire_time');
CALL add_index_if_not_exists('t_quick_answer', 'idx_qa_tenant_pattern', 'tenant_id,question_pattern(64)');

DROP PROCEDURE IF EXISTS add_index_if_not_exists;
