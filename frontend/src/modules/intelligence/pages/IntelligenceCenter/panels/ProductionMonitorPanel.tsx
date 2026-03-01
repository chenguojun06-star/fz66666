import React, { useState, useEffect, useCallback } from 'react';
import { Button, Alert, Spin, Empty, Statistic, Tag, Badge, Table, Tooltip, Collapse } from 'antd';
import {
  ReloadOutlined, ThunderboltOutlined, ClockCircleOutlined, AlertOutlined,
  WarningOutlined, BellOutlined, FireOutlined, CloseCircleOutlined, InfoCircleOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type {
  LivePulseResponse, BottleneckDetectionResponse, BottleneckItem,
  DeliveryRiskResponse, DeliveryRiskItem, AnomalyDetectionResponse, AnomalyItem,
  SmartNotificationResponse, NotificationItem, DefectHeatmapResponse, HeatCell,
} from '@/services/production/productionApi';

/* ── 辅助常量 ── */
const intensityColor = (v: number) =>
  v >= 0.8 ? '#ff4d4f' : v >= 0.6 ? '#ff7a45' : v >= 0.4 ? '#ffa940' : v >= 0.2 ? '#ffd666' : v > 0 ? '#ffe58f' : '#f6ffed';
const riskTag: Record<string, { color: string; text: string }> = {
  overdue: { color: 'red', text: '已逾期' }, danger: { color: 'volcano', text: '高风险' },
  warning: { color: 'orange', text: '需关注' }, safe: { color: 'green', text: '安全' },
};
const sevMap: Record<string, { color: string; text: string }> = {
  critical: { color: 'red', text: '严重堵塞' }, warning: { color: 'orange', text: '轻度积压' }, normal: { color: 'green', text: '正常' },
};
const typeLabel: Record<string, string> = { output_spike: '产量异常', quality_spike: '质量异常', idle_worker: '人员闲置', night_scan: '夜间扫码' };
const priStyle: Record<string, { color: string; bg: string; text: string }> = {
  urgent: { color: '#ff4d4f', bg: '#fff1f0', text: '紧急' }, high: { color: '#fa8c16', bg: '#fff7e6', text: '高' },
  normal: { color: '#1677ff', bg: '#e6f4ff', text: '普通' }, low: { color: '#8c8c8c', bg: '#fafafa', text: '低' },
};
const typeIcon: Record<string, string> = { overdue_warning: '⏰', stagnant_alert: '⏸️', milestone: '🎯', capacity_alert: '📊' };

/* ── 子组件 ── */
const AnomalyCard: React.FC<{ item: AnomalyItem }> = ({ item }) => {
  const icon = item.severity === 'critical' ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
    : item.severity === 'warning' ? <WarningOutlined style={{ color: '#faad14' }} />
    : <InfoCircleOutlined style={{ color: '#1677ff' }} />;
  return (
    <div className={`anomaly-card ${item.severity}`}>
      <div>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>
          <Badge color={item.severity === 'critical' ? 'red' : item.severity === 'warning' ? 'orange' : 'blue'} />
          {item.title} <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>{typeLabel[item.type] || item.type}</span>
        </div>
        <div style={{ fontSize: 13, color: '#595959', marginTop: 4 }}>{item.description}</div>
        {item.deviationRatio > 0 && (
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
            偏差 {item.deviationRatio.toFixed(1)}x · 今日 {item.todayValue} · 均值 {item.historyAvg.toFixed(1)}
          </div>
        )}
      </div>
    </div>
  );
};

const NotifyCard: React.FC<{ item: NotificationItem }> = ({ item }) => {
  const ps = priStyle[item.priority] || priStyle.normal;
  return (
    <div className="notify-card" style={{ borderLeftColor: ps.color, background: ps.bg }}>
      <span style={{ fontSize: 20 }}>{typeIcon[item.type] || '📢'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{item.title} <Tag color={ps.color} style={{ marginLeft: 8 }}>{ps.text}</Tag></div>
        <div className="notify-message">{item.message}</div>
        <div className="notify-meta">
          {item.targetUser && <span>👤 {item.targetUser}</span>}
          {item.orderNo && <span style={{ marginLeft: 8 }}>📋 {item.orderNo}</span>}
        </div>
      </div>
    </div>
  );
};

/* ── 表格列 ── */
const bnCols = [
  { title: '工序', dataIndex: 'stageName', width: 100 },
  { title: '上游完成', dataIndex: 'upstreamDone', width: 90, render: (v: number) => `${v}件` },
  { title: '本工序', dataIndex: 'currentDone', width: 90, render: (v: number) => `${v}件` },
  { title: '积压', dataIndex: 'backlog', width: 80, render: (v: number) => <span style={{ fontWeight: v > 0 ? 700 : 400 }}>{v}件</span> },
  { title: '程度', dataIndex: 'severity', width: 90, render: (s: BottleneckItem['severity']) => { const m = sevMap[s] || sevMap.normal; return <Tag color={m.color}>{m.text}</Tag>; } },
  { title: '建议', dataIndex: 'suggestion', ellipsis: true },
];

const rkCols = [
  { title: '订单号', dataIndex: 'orderNo', width: 130 },
  { title: '款号', dataIndex: 'styleNo', width: 110 },
  { title: '工厂', dataIndex: 'factoryName', width: 100, ellipsis: true },
  {
    title: '风险', dataIndex: 'riskLevel', width: 80,
    render: (r: string) => { const t = riskTag[r] || riskTag.safe; return <Tag color={t.color}>{t.text}</Tag>; },
    sorter: (a: DeliveryRiskItem, b: DeliveryRiskItem) => {
      const o: Record<string, number> = { overdue: 0, danger: 1, warning: 2, safe: 3 };
      return (o[a.riskLevel] ?? 3) - (o[b.riskLevel] ?? 3);
    },
    defaultSortOrder: 'ascend' as const,
  },
  { title: '进度', dataIndex: 'currentProgress', width: 70, render: (v: number) => `${v}%` },
  { title: '剩余', dataIndex: 'daysLeft', width: 70, render: (v: number) => <span className={v <= 0 ? 'risk-overdue' : v <= 3 ? 'risk-danger' : ''}>{v}天</span> },
  { title: '说明', dataIndex: 'riskDescription', ellipsis: true },
];

/* ── 主组件 ── */
const ProductionMonitorPanel: React.FC = () => {
  const [pulse, setPulse] = useState<LivePulseResponse | null>(null);
  const [bn, setBn] = useState<BottleneckDetectionResponse | null>(null);
  const [risk, setRisk] = useState<DeliveryRiskResponse | null>(null);
  const [anomaly, setAnomaly] = useState<AnomalyDetectionResponse | null>(null);
  const [notify, setNotify] = useState<SmartNotificationResponse | null>(null);
  const [hm, setHm] = useState<DefectHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [r1, r2, r3, r4, r5, r6] = await Promise.allSettled([
        intelligenceApi.getLivePulse(), intelligenceApi.detectBottleneck(),
        intelligenceApi.assessDeliveryRisk(), intelligenceApi.detectAnomalies(),
        intelligenceApi.getSmartNotifications(), intelligenceApi.getDefectHeatmap(),
      ]);
      if (r1.status === 'fulfilled') setPulse((r1.value as any)?.data ?? null);
      if (r2.status === 'fulfilled') setBn((r2.value as any)?.data ?? null);
      if (r3.status === 'fulfilled') setRisk((r3.value as any)?.data ?? null);
      if (r4.status === 'fulfilled') setAnomaly((r4.value as any)?.data ?? null);
      if (r5.status === 'fulfilled') setNotify((r5.value as any)?.data ?? null);
      if (r6.status === 'fulfilled') setHm((r6.value as any)?.data ?? null);
      const fails = [r1, r2, r3, r4, r5, r6].filter(r => r.status === 'rejected').length;
      if (fails > 0) setError(`${fails} 项数据加载失败`);
    } catch { setError('加载失败'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { const t = setInterval(fetchAll, 60000); return () => clearInterval(t); }, [fetchAll]);

  /* heatmap helpers */
  const hmProcesses = hm ? [...new Set(hm.cells.map(c => c.process))] : [];
  const hmFactories = hm ? [...new Set(hm.cells.map(c => c.factory))] : [];
  const cellMap = new Map<string, HeatCell>();
  hm?.cells.forEach(c => cellMap.set(`${c.process}__${c.factory}`, c));
  const criticalCnt = anomaly?.items?.filter(i => i.severity === 'critical').length ?? 0;

  const collapseItems = [
    /* ── 实时脉搏 ── */
    {
      key: 'pulse',
      label: <span><ThunderboltOutlined style={{ color: '#1677ff' }} /> 实时脉搏 {pulse && <Tag color="green" style={{ marginLeft: 8 }}>LIVE</Tag>}</span>,
      children: pulse ? (
        <>
          <div className="stat-row">
            {[
              { t: '活跃工厂', v: pulse.activeFactories, c: '#1677ff', icon: <ThunderboltOutlined /> },
              { t: '在线工人', v: pulse.activeWorkers, c: '#52c41a' },
              { t: '今日扫码', v: pulse.todayScanQty, c: '#722ed1', s: '件' },
              { t: '每小时速率', v: pulse.scanRatePerHour, c: '#fa8c16', s: '次/h' },
            ].map(i => (
              <div className="stat-card pulse-stat" key={i.t}>
                <Statistic title={i.t} value={i.v ?? '-'} prefix={i.icon} suffix={i.s} valueStyle={{ color: i.c }} />
              </div>
            ))}
          </div>
          {pulse.timeline?.length > 0 && (
            <>
              <div style={{ fontWeight: 600, margin: '12px 0 8px' }}>2小时脉搏波形</div>
              <div className="pulse-timeline">
                {pulse.timeline.map((p, idx) => {
                  const max = Math.max(...pulse.timeline.map(t => t.count), 1);
                  return (
                    <div key={idx} className="pulse-bar-wrap" title={`${p.time}: ${p.count}次`}>
                      <div className="pulse-bar" style={{ height: Math.max(4, (p.count / max) * 80) }} />
                      {idx % 3 === 0 && <span className="pulse-bar-label">{p.time?.slice(-5)}</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {pulse.stagnantFactories?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <span style={{ fontWeight: 600, color: '#ff4d4f' }}>⚠ 停滞工厂</span>
              <div style={{ marginTop: 4 }}>
                {pulse.stagnantFactories.map((f, i) => <Tag key={i} color="red" style={{ marginBottom: 4 }}>{f.factoryName} — 静默 {f.minutesSilent} 分钟</Tag>)}
              </div>
            </div>
          )}
        </>
      ) : <Empty description="暂无数据" />,
    },
    /* ── 异常与瓶颈 ── */
    {
      key: 'anomaly-bn',
      label: <span><AlertOutlined style={{ color: criticalCnt > 0 ? '#ff4d4f' : '#faad14' }} /> 异常与瓶颈 {criticalCnt > 0 && <Badge count={criticalCnt} style={{ marginLeft: 8 }} />}</span>,
      children: (
        <>
          <div className="pmo-section-title">
            异常检测 {anomaly?.items?.length
              ? <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400 }}>（共扫描 {anomaly.totalChecked} 项指标）</span>
              : <span style={{ color: '#52c41a' }}> — 正常</span>}
          </div>
          {anomaly?.items?.map((it, i) => <AnomalyCard key={i} item={it} />)}
          <div className="pmo-section-title" style={{ marginTop: 16 }}>瓶颈检测</div>
          {bn?.hasBottleneck
            ? <Alert type="warning" message={bn.summary} showIcon style={{ marginBottom: 8 }} />
            : bn && <Alert type="success" message="当前无工序瓶颈，生产流畅" showIcon style={{ marginBottom: 8 }} />}
          {bn?.items?.filter(i => i.severity !== 'normal').length ? (
            <Table rowKey="stageName" columns={bnCols} dataSource={bn.items.filter(i => i.severity !== 'normal')} pagination={false} size="small" />
          ) : null}
        </>
      ),
    },
    /* ── 交期预警 ── */
    {
      key: 'risk',
      label: <span><ClockCircleOutlined style={{ color: '#ff7a45' }} /> 交期预警 {risk && risk.overdueCount > 0 && <Badge count={risk.overdueCount} style={{ marginLeft: 8, background: '#ff4d4f' }} />}</span>,
      children: (
        <>
          {risk && (
            <div className="stat-row" style={{ marginBottom: 12 }}>
              {[
                { l: '总订单', v: risk.totalOrders, c: '' }, { l: '已逾期', v: risk.overdueCount, c: 'risk-overdue' },
                { l: '高风险', v: risk.dangerCount, c: 'risk-danger' }, { l: '需关注', v: risk.warningCount, c: 'risk-warning' },
              ].map(s => <div className="stat-card" key={s.l}><div className={`stat-value ${s.c}`}>{s.v}</div><div className="stat-label">{s.l}</div></div>)}
            </div>
          )}
          {risk?.items?.length
            ? <Table rowKey="orderId" columns={rkCols} dataSource={risk.items} pagination={{ pageSize: 10, showSizeChanger: false }} size="small" scroll={{ x: 700 }} />
            : <Empty description="暂无进行中订单" />}
        </>
      ),
    },
    /* ── 缺陷热力图 ── */
    {
      key: 'heatmap',
      label: <span><FireOutlined style={{ color: '#f5222d' }} /> 缺陷热力图 {hm && <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>共 {hm.totalDefects} 缺陷</span>}</span>,
      children: hm ? (
        <>
          <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
            <Statistic title="总缺陷" value={hm.totalDefects} prefix={<FireOutlined style={{ color: '#f5222d' }} />} />
            <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>最差工序</div><Tag color="red">{hm.worstProcess || '-'}</Tag></div>
            <div><div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>最差工厂</div><Tag color="volcano">{hm.worstFactory || '-'}</Tag></div>
          </div>
          <div className="heatmap-grid-wrapper">
            <table className="heatmap-table">
              <thead><tr>
                <th className="heatmap-corner">工序＼工厂</th>
                {hmFactories.map(f => <th key={f} className="heatmap-col-header">{f === hm.worstFactory && <WarningOutlined style={{ color: '#f5222d', marginRight: 4 }} />}{f}</th>)}
              </tr></thead>
              <tbody>{hmProcesses.map(p => (
                <tr key={p}>
                  <td className="heatmap-row-header">{p === hm.worstProcess && <WarningOutlined style={{ color: '#f5222d', marginRight: 4 }} />}{p}</td>
                  {hmFactories.map(f => { const c = cellMap.get(`${p}__${f}`); return (
                    <td key={f} className="heatmap-cell">
                      <Tooltip title={`${p} @ ${f}：${c?.defectCount ?? 0} 次，强度 ${((c?.intensity ?? 0) * 100).toFixed(0)}%`}>
                        <div className="heatmap-cell-inner" style={{ background: intensityColor(c?.intensity ?? 0) }}>{(c?.defectCount ?? 0) > 0 ? c!.defectCount : ''}</div>
                      </Tooltip>
                    </td>
                  ); })}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="heatmap-legend">
            <span>低</span>
            {[0, 0.2, 0.4, 0.6, 0.8].map(v => <div key={v} className="heatmap-legend-cell" style={{ background: intensityColor(v + 0.1) }} />)}
            <span>高</span>
          </div>
        </>
      ) : <Empty description="暂无数据" />,
    },
    /* ── 智能提醒 ── */
    {
      key: 'notify',
      label: <span><BellOutlined style={{ color: '#722ed1' }} /> 智能提醒 {notify && notify.pendingCount > 0 && <Badge count={notify.pendingCount} style={{ marginLeft: 8 }} />}</span>,
      children: (
        <>
          {notify && (
            <div className="stat-row" style={{ marginBottom: 12 }}>
              <div className="stat-card"><div className="stat-value" style={{ color: '#ff4d4f' }}>{notify.pendingCount}</div><div className="stat-label">待推送</div></div>
              <div className="stat-card"><div className="stat-value" style={{ color: '#1677ff' }}>{notify.sentToday}</div><div className="stat-label">今日已发</div></div>
              <div className="stat-card"><div className="stat-value" style={{ color: '#52c41a' }}>{notify.successRate}%</div><div className="stat-label">成功率</div></div>
            </div>
          )}
          {notify?.items?.length
            ? <div>{notify.items.map((it, i) => <NotifyCard key={i} item={it} />)}</div>
            : <Empty description="暂无待推送提醒" />}
        </>
      ),
    },
  ];

  return (
    <div className="intelligence-panel pmo-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>
          <DashboardOutlined style={{ marginRight: 6 }} /> 生产监控总览
        </span>
        <Button icon={<ReloadOutlined />} onClick={fetchAll} loading={loading}>刷新全部</Button>
      </div>
      {error && <Alert type="warning" message={error} closable style={{ marginBottom: 12 }} />}
      <Spin spinning={loading && !pulse && !risk}>
        <Collapse
          defaultActiveKey={['pulse', 'anomaly-bn', 'risk', 'heatmap', 'notify']}
          items={collapseItems}
          bordered={false}
          style={{ background: 'transparent' }}
        />
      </Spin>
    </div>
  );
};

export default ProductionMonitorPanel;
