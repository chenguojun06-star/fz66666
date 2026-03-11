-- Phase B 智能驾驶舱扩展：指标采纳率跟踪字段
-- 幂等写法，重复执行安全

SET @s1 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 't_intelligence_metrics'
                AND COLUMN_NAME = 'accepted') = 0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `accepted` TINYINT(1) DEFAULT NULL COMMENT ''建议是否被采纳(1=采纳,0=拒绝,NULL=未处理)''',
    'SELECT 1');
PREPARE s1 FROM @s1; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @s2 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 't_intelligence_metrics'
                AND COLUMN_NAME = 'overridden') = 0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `overridden` TINYINT(1) DEFAULT NULL COMMENT ''是否被人工改写(1=改写,0=原样使用,NULL=未处理)''',
    'SELECT 1');
PREPARE s2 FROM @s2; EXECUTE s2; DEALLOCATE PREPARE s2;
