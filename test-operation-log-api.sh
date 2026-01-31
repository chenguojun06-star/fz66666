#!/bin/bash
# 操作日志API测试脚本

BASE_URL="http://localhost:8088/api"
TOKEN="YOUR_AUTH_TOKEN"  # 替换为实际的Token

echo "=========================================="
echo "操作日志API测试"
echo "=========================================="
echo ""

# 1. 创建操作日志
echo "1️⃣ 测试创建操作日志..."
CREATE_RESPONSE=$(curl -s -X POST "${BASE_URL}/system/operation-log" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "module": "样衣开发",
    "operation": "删除",
    "operatorId": 1,
    "operatorName": "测试用户",
    "targetType": "款式",
    "targetId": "123",
    "targetName": "ST001",
    "reason": "重复录入，需要删除",
    "details": "{\"styleNo\":\"ST001\",\"customer\":\"XX品牌\",\"deleteTime\":\"2026-01-31T12:00:00\"}",
    "ip": "127.0.0.1",
    "userAgent": "Mozilla/5.0...",
    "operationTime": "2026-01-31T12:00:00",
    "status": "success"
  }')

echo "响应: ${CREATE_RESPONSE}"
echo ""

# 2. 查询操作日志列表
echo "2️⃣ 测试查询操作日志列表..."
LIST_RESPONSE=$(curl -s -X GET "${BASE_URL}/system/operation-log/list?page=1&pageSize=10" \
  -H "Authorization: Bearer ${TOKEN}")

echo "响应: ${LIST_RESPONSE}"
echo ""

# 3. 多条件筛选查询
echo "3️⃣ 测试多条件筛选..."
FILTER_RESPONSE=$(curl -s -X GET "${BASE_URL}/system/operation-log/list?page=1&pageSize=10&module=样衣开发&operation=删除&operatorName=测试用户" \
  -H "Authorization: Bearer ${TOKEN}")

echo "响应: ${FILTER_RESPONSE}"
echo ""

# 4. 时间范围查询
echo "4️⃣ 测试时间范围查询..."
DATE_RESPONSE=$(curl -s -X GET "${BASE_URL}/system/operation-log/list?page=1&pageSize=10&startDate=2026-01-01&endDate=2026-01-31" \
  -H "Authorization: Bearer ${TOKEN}")

echo "响应: ${DATE_RESPONSE}"
echo ""

echo "=========================================="
echo "测试完成！"
echo "=========================================="
echo ""
echo "⚠️ 注意："
echo "1. 需要先创建数据库表：backend/sql/20260131_create_operation_log.sql"
echo "2. 需要替换 TOKEN 为实际的认证令牌"
echo "3. 确保后端服务已启动（端口8088）"
