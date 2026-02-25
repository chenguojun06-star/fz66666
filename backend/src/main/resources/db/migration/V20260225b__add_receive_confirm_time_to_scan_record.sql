-- 新增 receive_time 和 confirm_time 字段到 t_scan_record
ALTER TABLE t_scan_record
  ADD COLUMN receive_time DATETIME NULL COMMENT '领取/开始时间',
  ADD COLUMN confirm_time DATETIME NULL COMMENT '录入结果/完成时间';
