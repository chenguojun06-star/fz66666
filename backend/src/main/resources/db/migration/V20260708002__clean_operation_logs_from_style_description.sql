-- ========================================================
-- 清理 t_style_info.description 字段中的操作日志污染
-- 问题原因：StyleOperationAppendHelper 将操作日志（如"退回纸样开发"、"修改款式"等）
--          错误地追加到了 description 字段，而该字段是用来存储生产要求的。
-- 修复方案：用 REGEXP_REPLACE 移除 description 中所有以 "[YYYY-MM-DD HH:mm:ss]" 开头的操作日志行，
--          保留用户实际输入的生产要求内容。
-- 注意：不使用 DELIMITER + 存储过程，因为 Flyway 不支持 DELIMITER 语法（P0 #1 铁律）
-- ========================================================

-- 单条 UPDATE：用 REGEXP_REPLACE 移除所有操作日志行，再 TRIM 清理首尾换行
UPDATE t_style_info
SET description = TRIM(BOTH '\n' FROM REGEXP_REPLACE(
    description,
    '\\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\\][^\\n]*\\n?',
    ''
))
WHERE description IS NOT NULL
  AND description != ''
  AND description REGEXP '\\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\\]'
  AND delete_flag = 0;
