#!/bin/bash

# 快速创建测试订单 PO20260122001
# 用于裁剪码扫描测试

set -e

echo "======================================"
echo "创建测试订单 PO20260122001"
echo "======================================"

# 数据库连接信息
DB_HOST="127.0.0.1"
DB_PORT="3308"
DB_USER="root"
DB_PASS="changeme"
DB_NAME="fashion_supplychain"

# SQL脚本路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$SCRIPT_DIR/create_test_order_PO20260122001.sql"

# 检查SQL文件是否存在
if [ ! -f "$SQL_FILE" ]; then
    echo "❌ 错误：找不到SQL脚本文件"
    echo "   期望路径: $SQL_FILE"
    exit 1
fi

echo "📋 准备执行SQL脚本..."
echo "   数据库: $DB_NAME"
echo "   端口: $DB_PORT"
echo ""

# 执行SQL脚本
if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$SQL_FILE"; then
    echo ""
    echo "✅ 测试订单创建成功！"
    echo ""
    echo "======================================"
    echo "📦 测试数据已准备就绪"
    echo "======================================"
    echo ""
    echo "测试二维码内容（选择一个扫描）："
    echo "-----------------------------------"
    
    # 获取二维码内容
    mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -N -e "
    SELECT CONCAT('菲号', LPAD(bundle_no, 2, '0'), ': ', qr_code)
    FROM t_cutting_bundle 
    WHERE production_order_no = 'PO20260122001'
    ORDER BY bundle_no;
    "
    
    echo "-----------------------------------"
    echo ""
    echo "💡 使用方法："
    echo "   1. 复制上面任意一个二维码内容"
    echo "   2. 生成二维码图片（使用在线工具或命令）"
    echo "   3. 在小程序中扫描测试"
    echo ""
    echo "🔗 在线二维码生成工具："
    echo "   https://cli.im/"
    echo "   https://www.qrcode-monkey.com/"
    echo ""
else
    echo ""
    echo "❌ 执行SQL脚本失败"
    echo "   请检查数据库连接和权限"
    exit 1
fi
