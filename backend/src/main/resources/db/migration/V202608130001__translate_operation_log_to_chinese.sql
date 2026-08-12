-- Flyway 迁移：把操作日志里的英文 action 翻译成中文
-- 背景：用户反馈"为什么还有这些要英文的垃圾玩意"
-- 之前版本代码写入的英文 action 还在数据库里，需要翻译成中文

-- t_style_operation_log 表
UPDATE t_style_operation_log SET action = '开始纸样开发' WHERE action = 'PATTERN_START';
UPDATE t_style_operation_log SET action = '完成纸样开发' WHERE action = 'PATTERN_COMPLETED';
UPDATE t_style_operation_log SET action = '纸样重置' WHERE action = 'PATTERN_RESET';
UPDATE t_style_operation_log SET action = '样衣重置' WHERE action = 'SAMPLE_RESET';
UPDATE t_style_operation_log SET action = '开始样衣开发' WHERE action = 'SAMPLE_START';
UPDATE t_style_operation_log SET action = '完成样衣开发' WHERE action = 'SAMPLE_COMPLETED';
UPDATE t_style_operation_log SET action = '保存生产需求' WHERE action = 'PRODUCTION_REQUIREMENTS_SAVE';
UPDATE t_style_operation_log SET action = '回退生产需求' WHERE action = 'PRODUCTION_REQUIREMENTS_ROLLBACK';
UPDATE t_style_operation_log SET action = '款式报废' WHERE action = 'STYLE_SCRAPPED';
UPDATE t_style_operation_log SET action = '款式创建' WHERE action = 'STYLE_CREATED';
UPDATE t_style_operation_log SET action = '款式更新' WHERE action = 'STYLE_UPDATED';
UPDATE t_style_operation_log SET action = '款式审核通过' WHERE action = 'STYLE_APPROVED';
UPDATE t_style_operation_log SET action = '款式审核驳回' WHERE action = 'STYLE_REJECTED';
UPDATE t_style_operation_log SET action = '推送到下单管理' WHERE action = 'PUSHED_TO_ORDER';
UPDATE t_style_operation_log SET action = '复制款式' WHERE action = 'STYLE_COPIED';

-- bizType 字段也翻译成中文
UPDATE t_style_operation_log SET biz_type = '款式' WHERE biz_type = 'style';
UPDATE t_style_operation_log SET biz_type = '纸样' WHERE biz_type = 'pattern';
UPDATE t_style_operation_log SET biz_type = '样衣' WHERE biz_type = 'sample';
UPDATE t_style_operation_log SET biz_type = '维护' WHERE biz_type = 'maintenance';
