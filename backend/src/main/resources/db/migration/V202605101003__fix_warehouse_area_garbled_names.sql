UPDATE t_warehouse_area SET area_name = '默认成品仓' WHERE warehouse_type = 'FINISHED' AND id LIKE 'default-%' AND area_name != '默认成品仓';
UPDATE t_warehouse_area SET area_name = '默认物料仓' WHERE warehouse_type = 'MATERIAL' AND id LIKE 'default-%' AND area_name != '默认物料仓';
UPDATE t_warehouse_area SET area_name = '默认样衣仓' WHERE warehouse_type = 'SAMPLE' AND id LIKE 'default-%' AND area_name != '默认样衣仓';

UPDATE t_dict SET dict_label = 'A仓' WHERE id = 615 AND dict_type = 'warehouse_location';
UPDATE t_dict SET dict_label = 'B仓' WHERE id = 616 AND dict_type = 'warehouse_location';
UPDATE t_dict SET dict_label = '默认仓库' WHERE id = 617 AND dict_type = 'warehouse_location';
UPDATE t_dict SET dict_label = 'A01-成品区' WHERE id = 611 AND dict_type = 'warehouse_location';

UPDATE t_dict SET dict_label = 'A区1号位' WHERE dict_type = 'finished_warehouse_location' AND dict_label = 'A-001';
UPDATE t_dict SET dict_label = 'A区2号位' WHERE dict_type = 'finished_warehouse_location' AND dict_label = 'A-002';
UPDATE t_dict SET dict_label = 'B区1号位' WHERE dict_type = 'finished_warehouse_location' AND dict_label = 'B-001';
UPDATE t_dict SET dict_label = 'B区2号位' WHERE dict_type = 'finished_warehouse_location' AND dict_label = 'B-002';
UPDATE t_dict SET dict_label = 'C区1号位' WHERE dict_type = 'finished_warehouse_location' AND dict_label = 'C-001';
UPDATE t_dict SET dict_label = 'C区2号位' WHERE dict_type = 'finished_warehouse_location' AND dict_label = 'C-002';

UPDATE t_dict SET dict_label = 'A区1号位' WHERE dict_type = 'material_warehouse_location' AND dict_label = 'A-001';
UPDATE t_dict SET dict_label = 'A区2号位' WHERE dict_type = 'material_warehouse_location' AND dict_label = 'A-002';
UPDATE t_dict SET dict_label = 'B区1号位' WHERE dict_type = 'material_warehouse_location' AND dict_label = 'B-001';
UPDATE t_dict SET dict_label = 'B区2号位' WHERE dict_type = 'material_warehouse_location' AND dict_label = 'B-002';
UPDATE t_dict SET dict_label = 'C区1号位' WHERE dict_type = 'material_warehouse_location' AND dict_label = 'C-001';
UPDATE t_dict SET dict_label = 'C区2号位' WHERE dict_type = 'material_warehouse_location' AND dict_label = 'C-002';
UPDATE t_dict SET dict_label = 'A区5号位' WHERE dict_type = 'material_warehouse_location' AND dict_label = 'A-005';

UPDATE t_dict SET dict_label = 'A区1号位' WHERE dict_type = 'sample_warehouse_location' AND dict_label = 'A-001';
UPDATE t_dict SET dict_label = 'A区2号位' WHERE dict_type = 'sample_warehouse_location' AND dict_label = 'A-002';
UPDATE t_dict SET dict_label = 'B区1号位' WHERE dict_type = 'sample_warehouse_location' AND dict_label = 'B-001';
UPDATE t_dict SET dict_label = 'B区2号位' WHERE dict_type = 'sample_warehouse_location' AND dict_label = 'B-002';
UPDATE t_dict SET dict_label = 'C区1号位' WHERE dict_type = 'sample_warehouse_location' AND dict_label = 'C-001';
UPDATE t_dict SET dict_label = 'C区2号位' WHERE dict_type = 'sample_warehouse_location' AND dict_label = 'C-002';

UPDATE t_dict SET dict_label = 'A区1号位' WHERE dict_type = 'warehouse_location' AND dict_label = 'A-001';
UPDATE t_dict SET dict_label = 'A区2号位' WHERE dict_type = 'warehouse_location' AND dict_label = 'A-002';
UPDATE t_dict SET dict_label = 'B区1号位' WHERE dict_type = 'warehouse_location' AND dict_label = 'B-001';
UPDATE t_dict SET dict_label = 'B区2号位' WHERE dict_type = 'warehouse_location' AND dict_label = 'B-002';
UPDATE t_dict SET dict_label = '待分配' WHERE dict_type = 'warehouse_location' AND dict_label = '待分配';
