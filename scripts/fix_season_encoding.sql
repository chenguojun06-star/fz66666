-- 修复t_dict表中季节的中文标签编码问题

UPDATE t_dict 
SET dict_label = '春季' 
WHERE dict_code = 'SPRING' AND dict_type = 'season';

UPDATE t_dict 
SET dict_label = '夏季' 
WHERE dict_code = 'SUMMER' AND dict_type = 'season';

UPDATE t_dict 
SET dict_label = '秋季' 
WHERE dict_code = 'AUTUMN' AND dict_type = 'season';

UPDATE t_dict 
SET dict_label = '冬季' 
WHERE dict_code = 'WINTER' AND dict_type = 'season';

COMMIT;
