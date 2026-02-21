-- Seed Flyway schema history on cloud DB
-- All these migrations have already been applied manually

CREATE TABLE IF NOT EXISTS flyway_schema_history (
    installed_rank INT NOT NULL,
    version VARCHAR(50),
    description VARCHAR(200) NOT NULL,
    type VARCHAR(20) NOT NULL,
    script VARCHAR(1000) NOT NULL,
    checksum INT,
    installed_by VARCHAR(100) NOT NULL,
    installed_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    execution_time INT NOT NULL,
    success TINYINT(1) NOT NULL,
    PRIMARY KEY (installed_rank)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO flyway_schema_history VALUES (1, '1', '<< Flyway Baseline >>', 'BASELINE', '<< Flyway Baseline >>', NULL, 'root', NOW(), 0, 1);
INSERT IGNORE INTO flyway_schema_history VALUES (2, '2026012102', 'init menu permissions', 'SQL', 'V2026012102__init_menu_permissions.sql', 0, 'root', NOW(), 100, 1);
INSERT IGNORE INTO flyway_schema_history VALUES (3, '2026012301', 'update procurement snapshot view', 'SQL', 'V2026012301__update_procurement_snapshot_view.sql', 0, 'root', NOW(), 100, 1);
INSERT IGNORE INTO flyway_schema_history VALUES (4, '20260131', 'add performance indexes', 'SQL', 'V20260131__add_performance_indexes.sql', 0, 'root', NOW(), 100, 1);
INSERT IGNORE INTO flyway_schema_history VALUES (5, '20260201', 'add foreign key constraints', 'SQL', 'V20260201__add_foreign_key_constraints.sql', 0, 'root', NOW(), 100, 1);
INSERT IGNORE INTO flyway_schema_history VALUES (6, '20260205', 'add order management fields', 'SQL', 'V20260205__add_order_management_fields.sql', 0, 'root', NOW(), 100, 1);
INSERT IGNORE INTO flyway_schema_history VALUES (7, '20260219', 'fix permission structure', 'SQL', 'V20260219__fix_permission_structure.sql', 0, 'root', NOW(), 100, 1);
INSERT IGNORE INTO flyway_schema_history VALUES (8, '20260221', 'init role templates and superadmin', 'SQL', 'V20260221__init_role_templates_and_superadmin.sql', 0, 'root', NOW(), 100, 1);
INSERT IGNORE INTO flyway_schema_history VALUES (9, '20260221.1', 'consolidate all missing migrations', 'SQL', 'V20260221b__consolidate_all_missing_migrations.sql', 0, 'root', NOW(), 100, 1);
INSERT IGNORE INTO flyway_schema_history VALUES (10, '20260222', 'fix superadmin bcrypt password', 'SQL', 'V20260222__fix_superadmin_bcrypt_password.sql', 0, 'root', NOW(), 100, 1);
INSERT IGNORE INTO flyway_schema_history VALUES (11, '20260222.1', 'tenant storage billing', 'SQL', 'V20260222b__tenant_storage_billing.sql', 0, 'root', NOW(), 100, 1);
INSERT IGNORE INTO flyway_schema_history VALUES (12, '20260222.2', 'billing cycle', 'SQL', 'V20260222c__billing_cycle.sql', 0, 'root', NOW(), 100, 1);
INSERT IGNORE INTO flyway_schema_history VALUES (13, '20260223', 'unit price audit and pattern version', 'SQL', 'V20260223__unit_price_audit_and_pattern_version.sql', 0, 'root', NOW(), 100, 1);
INSERT IGNORE INTO flyway_schema_history VALUES (14, '20260223.1', 'remaining tables and operator fields', 'SQL', 'V20260223b__remaining_tables_and_operator_fields.sql', 0, 'root', NOW(), 100, 1);

SELECT COUNT(*) AS records_inserted FROM flyway_schema_history;
