#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
历史操作日志清洗脚本（备注与操作日志分离 · 一次性数据修复）

背景：历史上系统操作日志被追加进实体 remarks 字段（格式 [yyyy-MM-dd HH:mm:ss] 操作人 动作：详情），
污染了备注输入框。本脚本将这些日志行抽取到 t_operation_log，remarks 仅保留人工备注。

安全设计：
- DRY_RUN=1（默认）只预览不执行
- 执行前自动备份原 remarks 到 t_remark_cleanup_backup（可回滚）
- 幂等：已在备份表中出现的 (table, record_id) 跳过
- 失败不中断，逐条 try/except

用法：
  python3 scripts/cleanup-remark-logs.py            # DRY_RUN 预览
  DRY_RUN=0 python3 scripts/cleanup-remark-logs.py  # 实际执行
"""

import os
import re
import sys

import pymysql

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3308"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "changeme")
DB_NAME = os.environ.get("DB_NAME", "fashion_supplychain")
DRY_RUN = os.environ.get("DRY_RUN", "1") == "1"

# 需要清洗的表：(表名, 备注列名, 模块名/操作日志 module)
TABLES = [
    ("t_production_order", "remarks", "生产订单"),
    ("t_material_purchase", "remark", "物料采购"),
    ("t_material_database", "remark", "物料资料"),
    ("t_cutting_task", "remarks", "裁剪任务"),
    ("t_cutting_bundle", "remark", "菲号"),
    ("t_pattern_production", "remarks", "样衣生产"),
    ("t_purchase_cart", "remark", "采购车"),
    ("t_scan_record", "remark", "扫码记录"),
    ("t_inventory_check_item", "remark", "盘点明细"),
    ("t_sample_loan_record", "remark", "样衣借还"),
    ("t_material_stock", "remark", "物料库存"),
]

# 日志行正则：行首时间戳 [yyyy-MM-dd HH:mm[:ss]] 操作人 动作：详情
LOG_LINE_RE = re.compile(
    r"^\s*\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?\][^\n]*"
)
# 操作人提取：紧跟时间戳的姓名（到下一个空格/：前）
ACTION_RE = re.compile(r"^\s*\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?\]\s*([^\s：:]+)\s*([^：:：]+)?[:：]?")


def log(msg):
    print(msg, flush=True)


def query(cur, sql, params=None):
    cur.execute(sql, params)
    return cur.fetchall()


def main():
    conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER,
                           password=DB_PASSWORD, database=DB_NAME,
                           cursorclass=pymysql.cursors.DictCursor,
                           charset="utf8mb4", autocommit=False)
    cur = conn.cursor()

    # 1. 建备份表（幂等）
    cur.execute("""
        CREATE TABLE IF NOT EXISTS t_remark_cleanup_backup (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            table_name VARCHAR(64) NOT NULL,
            record_id VARCHAR(64) NOT NULL,
            original_remark MEDIUMTEXT,
            clean_remark MEDIUMTEXT,
            log_count INT DEFAULT 0,
            cleaned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_table_record (table_name, record_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    conn.commit()
    log(f"备份表就绪，DRY_RUN={'预览' if DRY_RUN else '执行'}")

    total_extracted = 0
    total_cleaned_records = 0
    total_skipped = 0

    for table, col, module in TABLES:
        try:
            cur.execute(f"SHOW COLUMNS FROM `{table}` LIKE %s", (col,))
            if not cur.fetchone():
                log(f"  ⏭ 跳过 {table}（无 {col} 列）")
                continue
            cur.execute(f"SHOW COLUMNS FROM `{table}` LIKE 'tenant_id'")
            has_tenant = bool(cur.fetchone())
        except Exception as e:
            log(f"  ⏭ 跳过 {table}: {e}")
            continue

        rows = query(cur, f"SELECT id, `{col}` AS remark FROM `{table}` WHERE `{col}` IS NOT NULL AND `{col}` != ''")
        table_extracted = 0
        table_cleaned = 0
        for row in rows:
            rid = str(row["id"])
            remark = row["remark"] or ""
            lines = remark.split("\n")
            log_lines = [l for l in lines if LOG_LINE_RE.match(l)]
            if not log_lines:
                continue

            # 幂等：已清洗过的记录跳过
            exist = query(cur, "SELECT 1 FROM t_remark_cleanup_backup WHERE table_name=%s AND record_id=%s",
                          (table, rid))
            if exist:
                total_skipped += 1
                continue

            clean_lines = [l for l in lines if not LOG_LINE_RE.match(l)]
            clean_remark = "\n".join(clean_lines).strip()

            if not DRY_RUN:
                try:
                    # 备份原值
                    cur.execute(
                        "INSERT INTO t_remark_cleanup_backup (table_name, record_id, original_remark, clean_remark, log_count) "
                        "VALUES (%s, %s, %s, %s, %s)",
                        (table, rid, remark, clean_remark, len(log_lines)))

                    # 写操作日志（逐条）
                    for l in log_lines:
                        m = ACTION_RE.match(l)
                        operator = m.group(1) if m else None
                        action = (m.group(2) or "").strip() if m else None
                        tenant_id = None
                        if has_tenant:
                            tr = query(cur, f"SELECT tenant_id FROM `{table}` WHERE id=%s", (rid,))
                            tenant_id = tr[0]["tenant_id"] if tr else None
                        cur.execute(
                            "INSERT INTO t_operation_log "
                            "(module, operation, operator_name, target_type, target_id, details, operation_time, status, tenant_id) "
                            "VALUES (%s, %s, %s, %s, %s, %s, NOW(), 'success', %s)",
                            (module, action or "操作", operator, table, rid, l.strip(), tenant_id))

                    # 更新 remarks 为剩余人工备注
                    if clean_remark:
                        cur.execute(f"UPDATE `{table}` SET `{col}`=%s WHERE id=%s", (clean_remark, rid))
                    else:
                        cur.execute(f"UPDATE `{table}` SET `{col}`=NULL WHERE id=%s", (rid,))
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    log(f"  ⚠ {table} id={rid} 清洗失败（已回滚）: {e}")
                    continue

            table_extracted += len(log_lines)
            table_cleaned += 1

        if table_cleaned:
            log(f"  {'✅' if not DRY_RUN else '🔍'} {table}: {table_cleaned} 条记录，抽取 {table_extracted} 条日志行"
                + ("（DRY_RUN 未执行）" if DRY_RUN else ""))
        total_extracted += table_extracted
        total_cleaned_records += table_cleaned

    conn.close()
    log("=" * 60)
    log(f"完成：{total_cleaned_records} 条记录、{total_extracted} 条日志行"
        + ("（DRY_RUN 预览，未实际修改。执行请用 DRY_RUN=0）" if DRY_RUN else "（已执行并提交）"))
    log(f"跳过已清洗记录：{total_skipped} 条")
    if total_extracted > 0 and not DRY_RUN:
        log("回滚方式：从 t_remark_cleanup_backup 恢复 original_remark 即可")
    sys.exit(0)


if __name__ == "__main__":
    main()
