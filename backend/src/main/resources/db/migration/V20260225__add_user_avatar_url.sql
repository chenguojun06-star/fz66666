-- 给 t_user 表添加头像 URL 字段
ALTER TABLE t_user ADD COLUMN avatar_url VARCHAR(500) DEFAULT NULL COMMENT '用户头像URL（COS存储路径）';
