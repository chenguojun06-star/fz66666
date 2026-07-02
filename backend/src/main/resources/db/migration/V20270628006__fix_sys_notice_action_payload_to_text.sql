-- ================================================================
-- V20270628006: 修复 t_sys_notice.action_payload 列类型 json → text
--
-- 背景：
--   P0 线上事故：SysNoticeMapper 每分钟报 "setting parameters" 错误
--   根因：action_payload 列是 json 类型，Entity 是 String 无 TypeHandler
--   MyBatis StringTypeHandler 用 setString 设置参数到 json 列时，
--   MySQL JDBC 驱动类型映射不兼容，导致 PreparedStatement 设置参数失败
--   触发点：AiPatrolJob.recentlySentTaskNotice() 用 .eq(actionPayload, ...) 查询
--
-- 修复：把 action_payload 从 json 改成 text
--   actionPayload 存储的是 JSON 字符串（如 {"taskId":123}），text 类型完全满足需求
--   text 类型与 String 类型完全兼容，避免 TypeHandler 问题
--
-- 幂等性：MODIFY COLUMN 改成相同类型不会报错，天然幂等
-- ================================================================

ALTER TABLE t_sys_notice MODIFY COLUMN action_payload TEXT NULL COMMENT '一键处理参数JSON';
