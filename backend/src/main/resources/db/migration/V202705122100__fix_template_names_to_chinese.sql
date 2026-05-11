UPDATE t_template_library SET template_name = REPLACE(template_name, ' process 模板', ' 工序进度单价模板') WHERE template_name LIKE '% process 模板%';
UPDATE t_template_library SET template_name = REPLACE(template_name, ' size 模板', ' 尺寸模板') WHERE template_name LIKE '% size 模板%';
UPDATE t_template_library SET template_name = REPLACE(template_name, ' bom 模板', ' BOM模板') WHERE template_name LIKE '% bom 模板%';
UPDATE t_template_library SET template_name = REPLACE(template_name, ' progress 模板', ' 进度模板') WHERE template_name LIKE '% progress 模板%';
UPDATE t_template_library SET template_name = REPLACE(template_name, ' process_price 模板', ' 工序单价模板') WHERE template_name LIKE '% process_price 模板%';
