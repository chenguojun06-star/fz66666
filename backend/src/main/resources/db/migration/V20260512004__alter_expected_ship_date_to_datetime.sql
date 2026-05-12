ALTER TABLE t_production_order MODIFY COLUMN expected_ship_date DATETIME DEFAULT NULL COMMENT '预计出货日期（客户交期，精确到小时分钟）';

UPDATE t_production_order SET expected_ship_date = planned_end_date WHERE expected_ship_date IS NULL AND planned_end_date IS NOT NULL AND delete_flag = 0;
