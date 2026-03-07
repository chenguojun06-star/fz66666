SELECT u.id, u.username, u.is_tenant_owner, u.tenant_id,
       t.id as t_id, t.owner_user_id
FROM t_user u
LEFT JOIN t_tenant t ON t.owner_user_id = u.id
WHERE u.is_tenant_owner = 1
LIMIT 10;
