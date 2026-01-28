-- =====================================================
-- 添加节点操作记录字段
-- 用于存储进度球点击弹窗中的委派、指定、备注等信息
-- 执行时间: 2026-01-28
-- =====================================================

-- 添加 node_operations JSON 字段
ALTER TABLE t_production_order
ADD COLUMN IF NOT EXISTS node_operations JSON COMMENT '节点操作记录(委派工厂/指定负责人/备注等)';

-- 字段说明：
-- JSON 结构示例:
-- {
--   "cutting": {
--     "assignee": "张三",
--     "assigneeId": "user-001",
--     "remark": "注意面料方向",
--     "updatedAt": "2026-01-28 15:30:00",
--     "updatedBy": "admin"
--   },
--   "sewing": {
--     "delegateFactoryId": "factory-001",
--     "delegateFactoryName": "XX加工厂",
--     "assignee": "李四",
--     "assigneeId": "user-002",
--     "remark": "加急，1月30日前完成",
--     "updatedAt": "2026-01-28 15:30:00",
--     "updatedBy": "admin"
--   },
--   "ironing": {
--     "assignee": "王五",
--     "remark": "温度控制在150度"
--   },
--   "quality": {
--     "assignee": "赵六",
--     "remark": "重点检查领口"
--   },
--   "packaging": {
--     "assignee": "钱七",
--     "remark": "使用防尘袋包装"
--   },
--   "secondaryProcess": {
--     "processType": "绣花",
--     "delegateFactoryId": "factory-002",
--     "delegateFactoryName": "YY绣花厂",
--     "remark": "绣花图案见附件"
--   }
-- }

-- 验证字段添加成功
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_production_order'
  AND COLUMN_NAME = 'node_operations';
