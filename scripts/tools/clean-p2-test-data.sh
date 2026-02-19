#!/bin/bash

# P2测试数据清理脚本
# 用途：清理init-p2-test-environment.sh创建的测试数据

set -e

DB_CONTAINER="fashion-mysql-simple"
DB_NAME="fashion_supplychain"
DB_USER="root"
DB_PASSWORD="changeme"

echo "======================================"
echo " P2测试数据清理"
echo "======================================"
echo ""

# 确认操作
read -p "⚠️  确认删除所有TEST_*测试数据? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "❌ 取消清理操作"
  exit 0
fi

echo ""
echo "🧹 开始清理测试数据..."

# 清理测试库存
echo "   清理测试库存..."
docker exec $DB_CONTAINER mysql -u$DB_USER -p$DB_PASSWORD $DB_NAME \
  -e "DELETE FROM t_material_stock WHERE material_code LIKE 'TEST_MAT_%';"

# 清理测试物料
echo "   清理测试物料..."
docker exec $DB_CONTAINER mysql -u$DB_USER -p$DB_PASSWORD $DB_NAME \
  -e "DELETE FROM t_material WHERE material_code LIKE 'TEST_MAT_%';"

# 清理测试工厂
echo "   清理测试工厂..."
docker exec $DB_CONTAINER mysql -u$DB_USER -p$DB_PASSWORD $DB_NAME \
  -e "DELETE FROM t_factory WHERE code LIKE 'TEST_FACTORY_%';"

# 清理测试款式（需要先删除关联数据）
echo "   清理测试款式..."
docker exec $DB_CONTAINER mysql -u$DB_USER -p$DB_PASSWORD $DB_NAME << 'EOF'
DELETE FROM t_style_process WHERE style_id IN (SELECT id FROM t_style_info WHERE style_no LIKE 'TEST_STYLE_%');
DELETE FROM t_style_bom WHERE style_id IN (SELECT id FROM t_style_info WHERE style_no LIKE 'TEST_STYLE_%');
DELETE FROM t_style_size WHERE style_id IN (SELECT id FROM t_style_info WHERE style_no LIKE 'TEST_STYLE_%');
DELETE FROM t_style_info WHERE style_no LIKE 'TEST_STYLE_%';
EOF

# 清理测试用户
echo "   清理测试用户..."
docker exec $DB_CONTAINER mysql -u$DB_USER -p$DB_PASSWORD $DB_NAME \
  -e "DELETE FROM t_user WHERE username LIKE 'test_%';"

# 清理测试租户
echo "   清理测试租户..."
docker exec $DB_CONTAINER mysql -u$DB_USER -p$DB_PASSWORD $DB_NAME \
  -e "DELETE FROM t_tenant WHERE code = 'TEST_TENANT';"

echo ""
echo "✅ 清理完成！"
echo ""

# 验证清理结果
echo "📊 验证清理结果:"
docker exec $DB_CONTAINER mysql -u$DB_USER -p$DB_PASSWORD $DB_NAME << 'EOF'
SELECT 'tenant' as type, COUNT(*) as remaining FROM t_tenant WHERE code = 'TEST_TENANT'
UNION ALL
SELECT 'user', COUNT(*) FROM t_user WHERE username LIKE 'test_%'
UNION ALL
SELECT 'style', COUNT(*) FROM t_style_info WHERE style_no LIKE 'TEST_STYLE_%'
UNION ALL
SELECT 'factory', COUNT(*) FROM t_factory WHERE code LIKE 'TEST_FACTORY_%'
UNION ALL
SELECT 'material', COUNT(*) FROM t_material WHERE material_code LIKE 'TEST_MAT_%'
UNION ALL
SELECT 'stock', COUNT(*) FROM t_material_stock WHERE material_code LIKE 'TEST_MAT_%';
EOF

echo ""
echo "======================================"
echo "如需重新初始化测试环境:"
echo "   bash init-p2-test-environment.sh"
echo "======================================"
