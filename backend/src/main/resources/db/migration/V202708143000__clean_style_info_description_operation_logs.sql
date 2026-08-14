-- D-069: 清洗 t_style_info.description（生产要求）中被误写入的 BOM 操作日志行
-- 根因：StyleBomLogAppendHelper 曾通过 OperationLogAppendUtil 把
--       "[yyyy-MM-dd HH:mm:ss] 操作人 动作：详情" 格式日志 append 到 description 字段，
--       而该字段同时是样衣详情"生产要求"业务字段，导致打印制单/详情页出现日志污染。
-- 修复：后端已改写 t_style_operation_log（StyleLogHelper），本脚本清理存量脏数据。
-- 安全性：仅匹配行首的完整时间戳日志行，人工填写的生产要求文本不受影响。

UPDATE t_style_info
SET description = TRIM(BOTH '\n' FROM
        REGEXP_REPLACE(
            description,
            '(^|\\n)\\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\\][^\\n]*(\\n|$)',
            '\n'
        )
    )
WHERE description IS NOT NULL
  AND description REGEXP '(^|\\n)\\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\\]';
