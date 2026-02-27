-- 清理 t_dict 历史重复数据（同类型 + 同编码 / 同标签），保留最早记录
DELETE d1
FROM t_dict d1
JOIN t_dict d2
  ON d1.id > d2.id
 AND d1.dict_type = d2.dict_type
 AND UPPER(TRIM(d1.dict_code)) = UPPER(TRIM(d2.dict_code));

DELETE d1
FROM t_dict d1
JOIN t_dict d2
  ON d1.id > d2.id
 AND d1.dict_type = d2.dict_type
 AND TRIM(d1.dict_label) = TRIM(d2.dict_label);

-- 增加唯一索引，防止后续重复写入
ALTER TABLE t_dict
  ADD UNIQUE KEY uk_dict_type_code (dict_type, dict_code);

ALTER TABLE t_dict
  ADD UNIQUE KEY uk_dict_type_label (dict_type, dict_label);
