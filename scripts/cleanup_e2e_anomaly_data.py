#!/usr/bin/env python3
"""
清理E2E测试留下的异常数据

⚠️  警告：此脚本仅用于清理E2E测试脏数据，生产环境慎用

清理内容：
  1. t_cutting_bundle orphan 数据（6条，指向不存在订单）
  2. t_production_order delete_flag 异常（3条，已删除但状态未关闭）
"""

import pymysql
import os
import sys

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3308"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "changeme")
DB_NAME = os.environ.get("DB_NAME", "fashion_supplychain")

def cleanup_anomaly_data():
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor
    )

    cursor = conn.cursor()

    try:
        # 1. 清理 t_cutting_bundle orphan 数据（直接删除，因为订单不存在了）
        print("\n=== 清理 t_cutting_bundle orphan 数据 ===")
        cursor.execute("""
            SELECT COUNT(*) as cnt
            FROM t_cutting_bundle cb
            LEFT JOIN t_production_order po ON cb.production_order_id = po.id
            WHERE cb.production_order_id IS NOT NULL AND po.id IS NULL
        """)
        orphan_count = cursor.fetchone()['cnt']
        print(f"发现 {orphan_count} 条 orphan 数据")

        if orphan_count > 0:
            # 先查询这些数据的详细信息
            cursor.execute("""
                SELECT cb.id, cb.production_order_id, cb.style_no, cb.tenant_id
                FROM t_cutting_bundle cb
                LEFT JOIN t_production_order po ON cb.production_order_id = po.id
                WHERE cb.production_order_id IS NOT NULL AND po.id IS NULL
            """)
            orphan_records = cursor.fetchall()

            print("\n待清理的裁剪分菲记录：")
            for r in orphan_records:
                print(f"  ID: {r['id']}, OrderID: {r['production_order_id']}, Style: {r['style_no']}, Tenant: {r['tenant_id']}")

            # 确认是否清理
            confirm = input("\n⚠️  是否清理这些 orphan 数据？(yes/no): ")
            if confirm.lower() == 'yes':
                cursor.execute("""
                    DELETE cb FROM t_cutting_bundle cb
                    LEFT JOIN t_production_order po ON cb.production_order_id = po.id
                    WHERE cb.production_order_id IS NOT NULL AND po.id IS NULL
                """)
                conn.commit()
                print(f"✅ 已清理 {orphan_count} 条 t_cutting_bundle orphan 数据")
            else:
                print("❌ 跳过清理")

        # 2. 清理 t_production_order delete_flag 异常（将状态改为已关闭）
        print("\n=== 清理 t_production_order delete_flag 异常 ===")
        cursor.execute("""
            SELECT COUNT(*) as cnt
            FROM t_production_order
            WHERE delete_flag = 1 AND status IN ('PENDING', 'IN_PROGRESS', 'CONFIRMED')
        """)
        anomaly_count = cursor.fetchone()['cnt']
        print(f"发现 {anomaly_count} 条 delete_flag 异常数据")

        if anomaly_count > 0:
            # 先查询这些数据的详细信息
            cursor.execute("""
                SELECT id, order_no, status, tenant_id
                FROM t_production_order
                WHERE delete_flag = 1 AND status IN ('PENDING', 'IN_PROGRESS', 'CONFIRMED')
            """)
            anomaly_records = cursor.fetchall()

            print("\n待修复的订单记录：")
            for r in anomaly_records:
                print(f"  ID: {r['id']}, OrderNo: {r['order_no']}, Status: {r['status']}, Tenant: {r['tenant_id']}")

            # 确认是否修复
            confirm = input("\n⚠️  是否将这些订单状态改为CANCELLED？(yes/no): ")
            if confirm.lower() == 'yes':
                cursor.execute("""
                    UPDATE t_production_order
                    SET status = 'CANCELLED'
                    WHERE delete_flag = 1 AND status IN ('PENDING', 'IN_PROGRESS', 'CONFIRMED')
                """)
                conn.commit()
                print(f"✅ 已修复 {anomaly_count} 条 t_production_order delete_flag 异常")
            else:
                print("❌ 跳过修复")

        print("\n✅ 数据清理完成")

    except Exception as e:
        print(f"❌ 清理异常: {e}")
        conn.rollback()
        return 1
    finally:
        cursor.close()
        conn.close()

    return 0

if __name__ == "__main__":
    sys.exit(cleanup_anomaly_data())