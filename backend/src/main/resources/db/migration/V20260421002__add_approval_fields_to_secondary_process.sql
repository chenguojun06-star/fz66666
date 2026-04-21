IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 't_secondary_process' AND COLUMN_NAME = 'approval_status')
    ALTER TABLE t_secondary_process ADD approval_status NVARCHAR(32) DEFAULT NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 't_secondary_process' AND COLUMN_NAME = 'approved_by_id')
    ALTER TABLE t_secondary_process ADD approved_by_id NVARCHAR(64) DEFAULT NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 't_secondary_process' AND COLUMN_NAME = 'approved_by_name')
    ALTER TABLE t_secondary_process ADD approved_by_name NVARCHAR(128) DEFAULT NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 't_secondary_process' AND COLUMN_NAME = 'approved_time')
    ALTER TABLE t_secondary_process ADD approved_time DATETIME DEFAULT NULL;
