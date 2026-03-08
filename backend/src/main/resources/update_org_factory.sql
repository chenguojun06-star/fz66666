-- 更新数据库表结构以支持新功能
-- 1. 组织架构增加部门类别字段
ALTER TABLE t_organization_unit ADD COLUMN category VARCHAR(50) DEFAULT NULL COMMENT '部门类别';

-- 2. 工厂表增加负责人ID字段
ALTER TABLE t_factory ADD COLUMN manager_id VARCHAR(36) DEFAULT NULL COMMENT '负责人ID (关联系统用户)';
