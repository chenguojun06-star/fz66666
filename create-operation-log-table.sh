#!/bin/bash
# 手动执行SQL创建操作日志表

echo "🗄️ 创建操作日志表..."
echo "请手动连接数据库并执行以下SQL："
echo ""
echo "mysql -h127.0.0.1 -P3308 -uroot -p[密码] fashion_supplychain"
echo ""
cat /Users/guojunmini4/Documents/服装66666/backend/sql/20260131_create_operation_log.sql
echo ""
echo "或者直接执行："
echo "docker exec -i fashion-mysql-simple mysql -uroot -p[密码] fashion_supplychain < backend/sql/20260131_create_operation_log.sql"
