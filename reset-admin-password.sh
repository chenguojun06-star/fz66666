#!/bin/bash

# 重置管理员密码为 admin123
# BCrypt 加密后的密码（admin123）

echo "正在重置 admin 账号密码..."

docker exec fashion-mysql-simple mysql -uroot -pchangeme -e "
USE fashion_supplychain;
UPDATE t_user
SET password = '\$2a\$10\$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z2EE4XFM3FWJqoYWdLjpmly2'
WHERE username = 'admin';

SELECT username, name, status, '密码已重置为: admin123' AS message
FROM t_user
WHERE username = 'admin';
" 2>&1 | grep -v "Warning"

echo ""
echo "✅ 密码重置完成！"
echo ""
echo "请使用以下账号登录："
echo "  用户名：admin"
echo "  密码：admin123"
echo "  访问地址：http://localhost:5173"
echo ""
