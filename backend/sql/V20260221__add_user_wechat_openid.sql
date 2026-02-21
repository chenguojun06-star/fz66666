-- 微信小程序一键登录：给 t_user 表添加 openid 字段
-- 功能：员工首次手动绑定账号密码后，后续可用微信直接一键登录

ALTER TABLE t_user
    ADD COLUMN openid VARCHAR(128) DEFAULT NULL COMMENT '微信小程序 openid（用于一键免密登录）';

-- 加索引，提升登录查询性能（openid 查找用户是高频操作）
CREATE INDEX idx_t_user_openid ON t_user (openid);
