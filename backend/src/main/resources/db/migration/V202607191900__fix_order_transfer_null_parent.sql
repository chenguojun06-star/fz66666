-- Fix: t_permission id=55738 "订单转移" 的 parent_id 为 NULL
-- parent_id=NULL 被后端树算法误判为根节点，在权限配置界面产生一个多余的空模块列
-- 将其移到"生产管理"(id=3) 下，符合"订单转移"的业务语义
UPDATE t_permission
SET parent_id = 3,
    parent_name = '生产管理'
WHERE id = 55738
  AND parent_id IS NULL
  AND permission_code = 'MENU_ORDER_TRANSFER';
