#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# 修复：补回脚本误删的 {data.topPriorityOrder && ( 行

path = "/Users/guojunmini4/Documents/服装66666/frontend/src/modules/dashboard/components/SmartDailyBrief/index.tsx"

with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 找到 sdb-priority-order 所在行（被直接暴露，缺少 topPriorityOrder && 包裹）
target = '        <div className="sdb-priority-order">\n'
idx = None
for i, l in enumerate(lines):
    if l == target:
        idx = i
        break

if idx is None:
    print("ERROR: sdb-priority-order not found")
    exit(1)

print(f"找到 sdb-priority-order at line {idx+1}, 前一行: {repr(lines[idx-1])}")

# 在 sdb-priority-order 前插入缺失的两行 + 空行
insert = [
    "\n",
    "      {/* 首要关注订单 */}\n",
    "      {data.topPriorityOrder && (\n",
]
new_lines = lines[:idx] + insert + lines[idx:]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"写入完成，插入了 {len(insert)} 行，总行数: {len(new_lines)}")

new_block = """\
      {/* 四格数据 */}
      <div className="sdb-stats">
        {/* 格子 1: 昨日入库 — 蓝色 */}
        <div className="sdb-stat-item">
          <div className="sdb-stat-icon"><InboxOutlined /></div>
          <div className="sdb-stat-label">昨日入库</div>
          <div className="sdb-stat-value">
            {data.yesterdayWarehousingCount > 0
              ? <>{data.yesterdayWarehousingCount}<span className="sdb-stat-unit">单</span></>
              : <span className="sdb-empty">暂无</span>}
          </div>
          <div className="sdb-stat-sub">
            {data.yesterdayWarehousingCount > 0
              ? `${data.yesterdayWarehousingQuantity} 件`
              : `近7天 ${data.weekWarehousingCount ?? 0} 单`}
          </div>
        </div>

        {/* 格子 2: 今日扫码 — 紫色 */}
        <div className="sdb-stat-item">
          <div className="sdb-stat-icon"><ScanOutlined /></div>
          <div className="sdb-stat-label">今日扫码</div>
          <div className="sdb-stat-value">
            {data.todayScanCount > 0
              ? <>{data.todayScanCount}<span className="sdb-stat-unit">次</span></>
              : <span className="sdb-empty">暂无</span>}
          </div>
          <div className="sdb-stat-sub">
            {data.todayScanCount === 0 && (data.weekScanCount ?? 0) > 0
              ? `近7天 ${data.weekScanCount} 次`
              : '\\u00a0'}
          </div>
        </div>

        {/* 格子 3: 逾期订单 — 绿/红 */}
        <div className={`sdb-stat-item ${data.overdueOrderCount > 0 ? 'has-issue' : 'no-issue'}`}>
          <div className="sdb-stat-icon">
            {data.overdueOrderCount > 0 ? <ExclamationCircleOutlined /> : <CheckCircleOutlined />}
          </div>
          <div className="sdb-stat-label">逾期订单</div>
          <div className="sdb-stat-value">
            {data.overdueOrderCount}<span className="sdb-stat-unit">张</span>
          </div>
          <div className="sdb-stat-sub">{data.overdueOrderCount === 0 ? '无逾期 ✓' : '尽快跟进工厂'}</div>
        </div>

        {/* 格子 4: 高风险订单 — 绿/橙 */}
        <div className={`sdb-stat-item ${data.highRiskOrderCount > 0 ? 'has-issue' : 'no-issue'}`}>
          <div className="sdb-stat-icon">
            {data.highRiskOrderCount > 0 ? <WarningOutlined /> : <CheckCircleOutlined />}
          </div>
          <div className="sdb-stat-label">高风险订单</div>
          <div className="sdb-stat-value">
            {data.highRiskOrderCount}<span className="sdb-stat-unit">张</span>
          </div>
          <div className="sdb-stat-sub">7天内到期 进度&lt;50%</div>
        </div>
      </div>
"""

new_lines = lines[:start] + [new_block] + lines[end+1:]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("写入完成，总行数:", len(new_lines))
