ALTER TABLE t_dict ADD COLUMN tenant_id BIGINT DEFAULT NULL;

CREATE INDEX idx_dict_tenant_id ON t_dict (tenant_id);

CREATE INDEX idx_dict_type_tenant ON t_dict (dict_type, tenant_id);
