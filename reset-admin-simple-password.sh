#!/bin/bash

# 重置管理员密码为 123456
# BCrypt 加密后的密码（123456）

echo "正在重置 admin 账号密码为 123456..."

docker exec fashion-mysql-simple mysql -uroot -pchangeme -e "
USE fashion_supplychain;
UPDATE t_user
SET password = '\$2a\$10\$8J9VhjZ3SZJoMLSVVuGYLOJ/RQO8D3Y0J1Y9EVHVq6rJ0F0Y9pQq2'
WHERE username = 'admin';

SELECT username, name, status, '密码已重置为: 123456' AS message
FROM t_user
WHERE username = 'admin';
" 2>&1 | grep -v "Warning"

echo ""
echo "✅ 密码重置完成！"
echo ""
echo "请使用以下账号登录："
echo "  用户名：admin"
echo "  密码：123456"
echo "  访问地址：http://localhost:5173"
echo ""
