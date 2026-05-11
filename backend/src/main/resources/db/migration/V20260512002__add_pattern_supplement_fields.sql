ALTER TABLE t_style_attachment ADD COLUMN claim_time DATETIME DEFAULT NULL;
ALTER TABLE t_style_attachment ADD COLUMN complete_time DATETIME DEFAULT NULL;
ALTER TABLE t_style_attachment ADD COLUMN claim_user VARCHAR(64) DEFAULT NULL;
