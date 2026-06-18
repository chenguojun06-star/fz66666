#!/bin/bash

echo "=== 色卡管理功能测试 ==="

# 检查后端状态
echo -e "\n1. 检查后端状态..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/api/common/health)
echo "   HTTP状态码: $HTTP_CODE"

if [ "$HTTP_CODE" != "200" ]; then
  echo "   后端未正常响应，跳过API测试"
  exit 1
fi

# 检查数据库表
echo -e "\n2. 检查数据库表..."
TABLES=$(docker exec fashion-mysql-simple mysql -u root -pchangeme fashion_supplychain -N -e "SHOW TABLES LIKE 't_color%';" 2>/dev/null)
echo "   色卡相关表: $TABLES"

if [ -z "$TABLES" ]; then
  echo "   ❌ 色卡表不存在"
else
  echo "   ✅ 色卡表已创建"
fi

# 检查表结构
echo -e "\n3. 检查表结构..."
docker exec fashion-mysql-simple mysql -u root -pchangeme fashion_supplychain -e "
SELECT COUNT(*) as '字段数' FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA='fashion_supplychain' AND TABLE_NAME='t_color_card';
" 2>/dev/null | grep -v Warning

echo -e "\n4. 检查后端日志中的色卡相关启动信息..."
grep -i "color" /tmp/backend.log 2>/dev/null | head -5 || echo "   无color相关日志"

echo -e "\n=== 测试完成 ==="
