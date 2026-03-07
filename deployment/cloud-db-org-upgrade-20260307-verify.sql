-- 云端组织架构补库校验脚本

SHOW TABLES LIKE 't_organization_unit';

SHOW COLUMNS FROM t_factory LIKE 'factory_type';
SHOW COLUMNS FROM t_factory LIKE 'supplier_type';
SHOW COLUMNS FROM t_factory LIKE 'org_unit_id';
SHOW COLUMNS FROM t_factory LIKE 'parent_org_unit_id';
SHOW COLUMNS FROM t_factory LIKE 'parent_org_unit_name';
SHOW COLUMNS FROM t_factory LIKE 'org_path';
SHOW COLUMNS FROM t_factory LIKE 'daily_capacity';

SHOW COLUMNS FROM t_production_order LIKE 'org_unit_id';
SHOW COLUMNS FROM t_production_order LIKE 'parent_org_unit_id';
SHOW COLUMNS FROM t_production_order LIKE 'parent_org_unit_name';
SHOW COLUMNS FROM t_production_order LIKE 'org_path';
SHOW COLUMNS FROM t_production_order LIKE 'factory_type';
SHOW COLUMNS FROM t_production_order LIKE 'order_biz_type';

SHOW COLUMNS FROM t_user LIKE 'org_unit_id';
SHOW COLUMNS FROM t_user LIKE 'org_unit_name';
SHOW COLUMNS FROM t_user LIKE 'org_path';

SHOW COLUMNS FROM t_tenant LIKE 'tenant_type';

SHOW INDEX FROM t_organization_unit WHERE Key_name = 'idx_org_unit_parent';
SHOW INDEX FROM t_organization_unit WHERE Key_name = 'idx_org_unit_factory';
SHOW INDEX FROM t_organization_unit WHERE Key_name = 'idx_org_unit_tenant_type';

SELECT id, tenant_type FROM t_tenant LIMIT 20;

SELECT 'cloud-db-org-upgrade-20260307 verify finished' AS message;
