#!/usr/bin/env python3
"""
单价维护 → 生产订单 数据同步脚本
只同步模板有单价的订单，单向不回流
"""

import subprocess
import json

def run_sql(sql):
    """执行SQL并返回结果"""
    cmd = [
        'mysql', '-h', '127.0.0.1', '-P', '3308',
        '-u', 'root', '-pchangeme',
        'fashion_supplychain',
        '-N', '-e', sql
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"SQL Error: {result.stderr}")
        return None
    return result.stdout.strip()

def get_template_content(style_no):
    """获取款号的工序模板内容"""
    sql = f"""
    SELECT template_content
    FROM t_template_library
    WHERE template_type = 'process'
      AND source_style_no = '{style_no}'
      AND template_content LIKE '%unitPrice%'
    LIMIT 1
    """
    return run_sql(sql)

def convert_steps_to_nodes(template_content):
    """将模板的steps格式转换为订单的nodes格式"""
    try:
        data = json.loads(template_content)
        steps = data.get('steps', [])

        nodes = []
        for i, step in enumerate(steps):
            node = {
                'id': step.get('processCode', str(i+1).zfill(2)),
                'name': step.get('processName', ''),
                'unitPrice': step.get('unitPrice', 0),
                'progressStage': step.get('progressStage', step.get('processName', '')),
                'machineType': step.get('machineType', ''),
                'standardTime': step.get('standardTime', 0),
                'sortOrder': i
            }
            nodes.append(node)

        return json.dumps({'nodes': nodes}, ensure_ascii=False)
    except Exception as e:
        print(f"  ⚠️ 转换失败: {e}")
        return None

def main():
    print("=== 单价维护 → 生产订单 数据同步 ===\n")

    # 1. 获取需要回填的订单（progressWorkflowJson为NULL但模板有单价）
    sql = """
    SELECT o.id, o.order_no, o.style_no
    FROM t_production_order o
    JOIN t_template_library tl
        ON tl.source_style_no = o.style_no
        AND tl.template_type = 'process'
        AND tl.template_content LIKE '%unitPrice%'
    WHERE o.progress_workflow_json IS NULL
    """
    result = run_sql(sql)

    if not result:
        print("没有需要回填的订单")
        return

    orders = []
    for line in result.split('\n'):
        if not line.strip():
            continue
        parts = line.split('\t')
        if len(parts) >= 3:
            orders.append({
                'id': parts[0],
                'order_no': parts[1],
                'style_no': parts[2]
            })

    print(f"需要回填的订单: {len(orders)} 个\n")

    updated = 0
    for order in orders:
        template_content = get_template_content(order['style_no'])
        if not template_content:
            print(f"  ⚠️ {order['order_no']}: 无模板")
            continue

        workflow_json = convert_steps_to_nodes(template_content)
        if not workflow_json:
            continue

        # 转义单引号
        workflow_json_escaped = workflow_json.replace("'", "''")

        update_sql = f"""
        UPDATE t_production_order
        SET progress_workflow_json = '{workflow_json_escaped}',
            update_time = NOW()
        WHERE id = '{order['id']}'
        """
        run_sql(update_sql)
        print(f"  ✅ {order['order_no']} ({order['style_no']}): 已回填工序单价")
        updated += 1

    print(f"\n回填订单: {updated} 个")

    # 2. 验证结果
    print("\n=== 验证结果 ===")
    sql = """
    SELECT
        o.order_no,
        o.style_no,
        CASE
            WHEN o.progress_workflow_json IS NULL THEN 'NULL'
            WHEN o.progress_workflow_json LIKE '%unitPrice%' THEN 'HAS_UNITPRICE'
            ELSE 'NO_UNITPRICE'
        END AS status
    FROM t_production_order o
    WHERE o.progress_workflow_json IS NOT NULL
    ORDER BY o.order_no DESC
    LIMIT 15
    """
    result = run_sql(sql)
    if result:
        for line in result.split('\n'):
            if line.strip():
                print(f"  {line}")

if __name__ == '__main__':
    main()
