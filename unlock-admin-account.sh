#!/bin/bash

# 解除 admin 账号锁定 - 清除登录失败记录

echo "正在解除 admin 账号锁定..."

# 清除登录失败日志
docker exec fashion-mysql-simple mysql -uroot -pchangeme -e "
USE fashion_supplychain;

-- 删除 admin 的失败登录记录
DELETE FROM t_login_log
WHERE username = 'admin'
AND login_result = 'FAILED'
AND login_time > DATE_SUB(NOW(), INTERVAL 1 HOUR);

-- 查看清理结果
SELECT
    '已清除失败登录记录' AS message,
    COUNT(*) AS remaining_failed_logs
FROM t_login_log
WHERE username = 'admin'
AND login_result = 'FAILED';
" 2>&1 | grep -v "Warning"

echo ""
echo "✅ 账号锁定已解除！"
echo ""
echo "现在可以使用以下账号登录："
echo "  用户名：admin"
echo "  密码：admin123"
echo "  访问地址：http://localhost:5173"
echo ""
