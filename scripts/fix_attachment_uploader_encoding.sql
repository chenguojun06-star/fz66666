-- 修复t_style_attachment表中上传人的中文编码问题

UPDATE t_style_attachment 
SET uploader = '系统管理员' 
WHERE uploader LIKE '%\xE7%' OR uploader REGEXP '[^\x00-\x7F]';

COMMIT;
