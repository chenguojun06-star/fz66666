ALTER TABLE t_pattern_scan_record
    ADD COLUMN warehouse_area_id VARCHAR(64) DEFAULT NULL COMMENT '仓库区域ID';

ALTER TABLE t_pattern_scan_record
    ADD COLUMN warehouse_location_code VARCHAR(64) DEFAULT NULL COMMENT '库位编码';