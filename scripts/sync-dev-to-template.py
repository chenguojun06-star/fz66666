#!/usr/bin/env python3
"""
开发端 → 单价维护 数据同步脚本
只同步有数据的款号，不回流
"""

import subprocess
import json
import uuid

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

def get_style_processes(style_no):
    """获取款号的所有工序"""
    sql = f"""
    SELECT
        sp.sort_order,
        sp.process_name,
        sp.price,
        IFNULL(sp.machine_type, ''),
        IFNULL(sp.progress_stage, ''),
        sp.standard_time
    FROM t_style_process sp
    JOIN t_style_info si ON sp.style_id = si.id
    WHERE si.style_no = '{style_no}' AND sp.price > 0
    ORDER BY sp.sort_order
    """
    result = run_sql(sql)
    if not result:
        return []

    processes = []
    for line in result.split('\n'):
        if not line.strip():
            continue
        parts = line.split('\t')
        if len(parts) >= 6:
            processes.append({
                'processCode': str(parts[0]).zfill(2),
                'processName': parts[1],
                'unitPrice': float(parts[2]),
                'machineType': parts[3],
                'progressStage': parts[4],
                'standardTime': int(parts[5]) if parts[5] else 0
            })
    return processes

def create_template(style_no, processes):
    """创建工序模板"""
    template_id = str(uuid.uuid4())
    template_key = f"style_{style_no}"
    template_name = f"{style_no}-工艺模板"
    template_content = json.dumps({'steps': processes}, ensure_ascii=False)

    # 转义单引号
    template_content_escaped = template_content.replace("'", "''")

    sql = f"""
    INSERT INTO t_template_library
    (id, template_type, template_key, template_name, source_style_no, template_content, locked, create_time, update_time)
    VALUES
    ('{template_id}', 'process', '{template_key}', '{template_name}', '{style_no}',
     '{template_content_escaped}', 1, NOW(), NOW())
    """
    run_sql(sql)
    return template_id

def main():
    # 1. 获取需要创建模板的款号
    sql = """
    SELECT DISTINCT si.style_no
    FROM t_style_process sp
    JOIN t_style_info si ON sp.style_id = si.id
    WHERE sp.price > 0
      AND si.style_no NOT IN (
          SELECT source_style_no FROM t_template_library
          WHERE template_type = 'process' AND source_style_no IS NOT NULL
      )
    """
    result = run_sql(sql)
    if not result:
        print("没有需要创建的模板")
        return

    style_nos = [s.strip() for s in result.split('\n') if s.strip()]
    print(f"需要创建模板的款号: {len(style_nos)} 个")

    created = 0
    for style_no in style_nos:
        processes = get_style_processes(style_no)
        if processes:
            template_id = create_template(style_no, processes)
            print(f"  ✅ {style_no}: {len(processes)} 个工序 → {template_id[:8]}...")
            created += 1
        else:
            print(f"  ⚠️ {style_no}: 无工序数据")

    print(f"\n新增工序模板: {created} 个")

    # 2. 更新空模板
    sql = """
    SELECT tl.id, tl.source_style_no
    FROM t_template_library tl
    WHERE tl.template_type = 'process'
      AND (tl.template_content IS NULL
           OR tl.template_content = ''
           OR tl.template_content = '{"steps":[]}')
      AND tl.source_style_no IN (
          SELECT DISTINCT si.style_no
          FROM t_style_process sp
          JOIN t_style_info si ON sp.style_id = si.id
          WHERE sp.price > 0
      )
    """
    result = run_sql(sql)
    if result:
        updated = 0
        for line in result.split('\n'):
            if not line.strip():
                continue
            parts = line.split('\t')
            if len(parts) >= 2:
                tpl_id, style_no = parts[0], parts[1]
                processes = get_style_processes(style_no)
                if processes:
                    template_content = json.dumps({'steps': processes}, ensure_ascii=False)
                    template_content_escaped = template_content.replace("'", "''")
                    update_sql = f"""
                    UPDATE t_template_library
                    SET template_content = '{template_content_escaped}', update_time = NOW()
                    WHERE id = '{tpl_id}'
                    """
                    run_sql(update_sql)
                    print(f"  🔄 更新 {style_no}: {len(processes)} 个工序")
                    updated += 1
        print(f"\n更新空模板: {updated} 个")

    # 3. 验证结果
    print("\n=== 验证结果 ===")
    sql = """
    SELECT
        source_style_no,
        template_name,
        CASE
            WHEN template_content LIKE '%unitPrice%' THEN 'HAS_UNITPRICE'
            ELSE 'NO_UNITPRICE'
        END AS status
    FROM t_template_library
    WHERE template_type = 'process'
      AND source_style_no IS NOT NULL
    ORDER BY source_style_no
    """
    result = run_sql(sql)
    if result:
        for line in result.split('\n'):
            if line.strip():
                print(f"  {line}")

if __name__ == '__main__':
    main()
