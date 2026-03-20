-- ============================================================
-- V202607192000__fix_permission_name_encoding.sql
-- 修复 t_permission 表中因字符集连接错误导致的双重编码乱码
-- 根因: 建表初始数据通过 latin1/cp1252 连接写入 utf8mb4 列，
--       UTF-8 多字节被当作 Latin-1 字符存储并再次 UTF-8 编码，
--       导致 "仪表盘" 等中文在 Java 侧读取后显示为 "ä»ªè¡¨ç›˜"
-- 修复范围: permission_name 23条 + parent_name 2条
-- ============================================================

-- 菜单级权限名称修复（主导航菜单）
UPDATE t_permission SET permission_name = '仪表盘'     WHERE id = 1;
UPDATE t_permission SET permission_name = '基础资料'   WHERE id = 2;
UPDATE t_permission SET permission_name = '样衣开发'   WHERE id = 6;
UPDATE t_permission SET permission_name = '下单管理'   WHERE id = 7;
UPDATE t_permission SET permission_name = '资料中心'   WHERE id = 8;
UPDATE t_permission SET permission_name = '单价维护'   WHERE id = 9;
UPDATE t_permission SET permission_name = '我的订单'   WHERE id = 10;
UPDATE t_permission SET permission_name = '物料采购'   WHERE id = 11;
UPDATE t_permission SET permission_name = '裁剪管理'   WHERE id = 12;
UPDATE t_permission SET permission_name = '生产进度'   WHERE id = 13;
UPDATE t_permission SET permission_name = '物料对账'   WHERE id = 15;
UPDATE t_permission SET permission_name = '成品结算'   WHERE id = 16;
UPDATE t_permission SET permission_name = '审批付款'   WHERE id = 17;
UPDATE t_permission SET permission_name = '人员管理'   WHERE id = 19;
UPDATE t_permission SET permission_name = '角色管理'   WHERE id = 20;
UPDATE t_permission SET permission_name = '加工厂管理' WHERE id = 21;
UPDATE t_permission SET permission_name = '登录日志'   WHERE id = 23;

-- 财务类权限名称修复
UPDATE t_permission SET permission_name = '工资支付管理' WHERE id = 28713;
UPDATE t_permission SET permission_name = '工资支付查看' WHERE id = 28714;
UPDATE t_permission SET permission_name = '结算审批'     WHERE id = 28715;

-- 智能模块权限名称修复
UPDATE t_permission SET permission_name = '月度经营汇总' WHERE id = 55487;

-- 系统集成权限名称修复
UPDATE t_permission SET permission_name = 'API对接管理' WHERE id = 55737;
UPDATE t_permission SET permission_name = '订单转移'    WHERE id = 55738;

-- 修复同样受影响的 parent_name 字段（父节点名称同步错误）
UPDATE t_permission SET parent_name = '仪表盘'   WHERE id = 55487;
UPDATE t_permission SET parent_name = '生产管理' WHERE id = 55738;
