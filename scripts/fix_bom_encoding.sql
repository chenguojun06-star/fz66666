-- 修复t_style_bom表中的中文字符编码问题

-- MAT001: 面料 - 纯棉
UPDATE t_style_bom 
SET material_name = '纯棉布料', 
    color = '白色', 
    specification = '100%纯棉', 
    unit = '米',
    supplier = '纺织厂A'
WHERE material_code = 'MAT001';

-- MAT002: 辅料
UPDATE t_style_bom 
SET material_name = '拉链', 
    color = 'YKK金属色', 
    specification = NULL, 
    unit = '条',
    supplier = 'YKK供应商'
WHERE material_code = 'MAT002';

-- MAT003: 其他辅料
UPDATE t_style_bom 
SET material_name = '纽扣', 
    color = '银色', 
    specification = '直径2cm', 
    unit = '个',
    supplier = '五金厂B'
WHERE material_code = 'MAT003';

-- 提交更改
COMMIT;
