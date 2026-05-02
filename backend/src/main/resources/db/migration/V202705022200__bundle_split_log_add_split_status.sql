ALTER TABLE t_cutting_bundle_split_log
    ADD COLUMN split_status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED';
