import React, { useState, useEffect, useCallback } from 'react';
import { Input, Select, Button, InputNumber, Spin, Empty, Alert, Tag, Table, Progress } from 'antd';
import { SearchOutlined, RocketOutlined, StarFilled, ReloadOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type {
  SmartAssignmentResponse, WorkerRecommendation,
  WorkerEfficiencyResponse, WorkerEfficiencyItem,
  DeliveryPredictionResponse,
} from '@/services/production/productionApi';

const STAGE_OPTIONS = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '质检', '入库'].map(s => ({ label: s, value: s }));

const levelTag: Record<string, { color: string; text: string }> = {
  excellent: { color: 'green', text: '优秀' },
  good: { color: 'blue', text: '良好' },
  normal: { color: 'default', text: '普通' },
};

const dims = [
  { key: 'speedScore' as const, label: '速度', color: '#1677ff' },
  { key: 'qualityScore' as const, label: '质量', color: '#52c41a' },
  { key: 'stabilityScore' as const, label: '稳定', color: '#722ed1' },
  { key: 'versatilityScore' as const, label: '全能', color: '#fa8c16' },
  { key: 'attendanceScore' as const, label: '出勤', color: '#13c2c2' },
];

const trendTag: Record<string, { color: string; text: string }> = {
  rising: { color: 'green', text: '↑ 上升' },
  stable: { color: 'blue', text: '→ 稳定' },
  declining: { color: 'red', text: '↓ 下滑' },
};

/* ---------- 雷达迷你图 ---------- */
const RadarMini: React.FC<{ worker: WorkerEfficiencyItem }> = ({ worker }) => {
  const size = 80, cx = 40, cy = 40, r = 30;
  const pts = dims.map((d, i) => {
    const a = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
    const v = (worker[d.key] ?? 0) / 100;
    return { x: cx + r * v * Math.cos(a), y: cy + r * v * Math.sin(a) };
  });
  return (
    <svg width={size} height={size}>
      {[0.25, 0.5, 0.75, 1].map(s => (
        <polygon key={s} points={dims.map((_, i) => {
          const a = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
          return `${cx + r * s * Math.cos(a)},${cy + r * s * Math.sin(a)}`;
        }).join(' ')} fill="none" stroke="#e8e8e8" strokeWidth={0.5} />
      ))}
      <polygon
        points={pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
        fill="rgba(22,119,255,0.15)" stroke="#1677ff" strokeWidth={1.5}
      />
    </svg>
  );
};

/* ---------- 效率表格列定义 ---------- */
const effColumns = [
  { title: '雷达', key: 'radar', width: 90, render: (_: unknown, r: WorkerEfficiencyItem) => <RadarMini worker={r} /> },
  { title: '姓名', dataIndex: 'operatorName', key: 'name', width: 80 },
  {
    title: '综合分', dataIndex: 'overallScore', key: 'score', width: 80,
    render: (v: number) => <span style={{ fontSize: 18, fontWeight: 700, color: v >= 80 ? '#52c41a' : v >= 60 ? '#1677ff' : '#ff4d4f' }}>{v}</span>,
    sorter: (a: WorkerEfficiencyItem, b: WorkerEfficiencyItem) => a.overallScore - b.overallScore,
    defaultSortOrder: 'descend' as const,
  },
  ...dims.map(d => ({
    title: d.label, dataIndex: d.key, key: d.key, width: 70,
    render: (v: number) => (
      <div className="osa-score-bar-wrap">
        <div className="osa-score-bar" style={{ width: `${v}%`, background: d.color }} />
        <span className="osa-score-val">{v}</span>
      </div>
    ),
  })),
  { title: '擅长', dataIndex: 'bestProcess', key: 'bp', width: 80 },
  { title: '日均', dataIndex: 'dailyAvgOutput', key: 'dao', width: 70, render: (v: number) => `${v}件` },
  {
    title: '趋势', dataIndex: 'trend', key: 'trend', width: 80,
    render: (t: string) => { const tg = trendTag[t] || trendTag.stable; return <Tag color={tg.color}>{tg.text}</Tag>; },
  },
];

/* ========== 主面板 ========== */
const OrderSmartAnalysisPanel: React.FC = () => {
  const [orderId, setOrderId] = useState('');
  const [stageName, setStageName] = useState<string>('车缝');
  const [quantity, setQuantity] = useState<number | null>(null);

  const [effData, setEffData] = useState<WorkerEfficiencyResponse | null>(null);
  const [effLoading, setEffLoading] = useState(false);
  const [effErr, setEffErr] = useState('');

  const [assignData, setAssignData] = useState<SmartAssignmentResponse | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignErr, setAssignErr] = useState('');

  const [predData, setPredData] = useState<DeliveryPredictionResponse | null>(null);
  const [predLoading, setPredLoading] = useState(false);
  const [predErr, setPredErr] = useState('');

  /* 自动加载工人效率 */
  const fetchEff = useCallback(async () => {
    setEffLoading(true); setEffErr('');
    try {
      const res = await intelligenceApi.getWorkerEfficiency() as any;
      setEffData(res?.data ?? null);
    } catch (e: any) { setEffErr(e?.message || '加载失败'); }
    finally { setEffLoading(false); }
  }, []);
  useEffect(() => { fetchEff(); }, [fetchEff]);

  /* 智能派工 */
  const fetchAssign = useCallback(async () => {
    if (!stageName) return;
    setAssignLoading(true); setAssignErr('');
    try {
      const res = await intelligenceApi.recommendAssignment({ stageName, quantity: quantity ?? undefined }) as any;
      setAssignData(res?.data ?? null);
    } catch (e: any) { setAssignErr(e?.message || '推荐失败'); }
    finally { setAssignLoading(false); }
  }, [stageName, quantity]);

  /* 完工预测 */
  const fetchPred = useCallback(async () => {
    if (!orderId.trim()) return;
    setPredLoading(true); setPredErr('');
    try {
      const res = await intelligenceApi.predictDelivery({ orderId: orderId.trim() }) as any;
      setPredData(res?.data ?? null);
    } catch (e: any) { setPredErr(e?.message || '预测失败'); }
    finally { setPredLoading(false); }
  }, [orderId]);

  const handleAnalyze = () => { fetchAssign(); if (orderId.trim()) fetchPred(); };

  const confColor = (predData?.confidence ?? 0) >= 80 ? '#52c41a' : (predData?.confidence ?? 0) >= 50 ? '#faad14' : '#ff4d4f';

  return (
    <div className="intelligence-panel osa-panel">
      {/* ── 输入栏 ── */}
      <div className="osa-input-row">
        <Input value={orderId} onChange={e => setOrderId(e.target.value)}
          placeholder="订单ID（完工预测用）" style={{ width: 200 }} onPressEnter={handleAnalyze} />
        <Select value={stageName} onChange={setStageName} options={STAGE_OPTIONS}
          style={{ width: 140 }} placeholder="工序" />
        <InputNumber value={quantity} onChange={v => setQuantity(v)}
          placeholder="件数(可选)" min={1} style={{ width: 130 }} />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleAnalyze}
          loading={assignLoading || predLoading}>智能分析</Button>
      </div>

      {/* ── 工人效率画像 ── */}
      <div className="osa-section-title">
        <StarFilled style={{ color: '#faad14', marginRight: 6 }} />工人效率画像
        <Button size="small" icon={<ReloadOutlined />} onClick={fetchEff}
          loading={effLoading} style={{ marginLeft: 12 }}>刷新</Button>
      </div>
      {effErr && <Alert type="error" message={effErr} style={{ marginBottom: 12 }} />}
      <Spin spinning={effLoading}>
        {effData?.workers?.length ? (
          <Table rowKey="operatorName" columns={effColumns} dataSource={effData.workers}
            pagination={{ pageSize: 8, showSizeChanger: false }} size="small" scroll={{ x: 900 }} />
        ) : !effLoading && <Empty description="暂无工人数据" />}
      </Spin>

      {/* ── 智能派工推荐 ── */}
      <div className="osa-section-title">👥 智能派工推荐</div>
      {assignErr && <Alert type="error" message={assignErr} style={{ marginBottom: 12 }} />}
      <Spin spinning={assignLoading}>
        {assignData?.recommendations?.length ? (
          <>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#8c8c8c' }}>
              「{assignData.stageName}」工序 Top {assignData.recommendations.length} 推荐人选
            </div>
            {assignData.recommendations.map((w: WorkerRecommendation, idx: number) => (
              <div key={w.operatorName} className="worker-card">
                <div className={`rank ${idx < 3 ? 'top' : ''}`}>{idx + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {w.operatorName}
                    <Tag color={levelTag[w.level]?.color} style={{ marginLeft: 8 }}>{levelTag[w.level]?.text || w.level}</Tag>
                    <span style={{ float: 'right', fontSize: 20, fontWeight: 700, color: '#1677ff' }}>{w.score}分</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#595959', marginTop: 4 }}>{w.reason}</div>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
                    日均产量：{w.avgPerDay.toFixed(0)} 件 | 对比均值：
                    <span style={{ color: w.vsAvgPct >= 0 ? '#52c41a' : '#ff4d4f' }}>
                      {w.vsAvgPct >= 0 ? '+' : ''}{w.vsAvgPct.toFixed(0)}%
                    </span>
                    {w.lastActiveDate && ` | 最后活跃：${w.lastActiveDate}`}
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : !assignLoading && <Empty description="选择工序后点击「智能分析」获取推荐" />}
      </Spin>

      {/* ── 完工预测 ── */}
      <div className="osa-section-title">
        <RocketOutlined style={{ marginRight: 6, color: '#1677ff' }} />完工预测
      </div>
      {predErr && <Alert type="error" message={predErr} style={{ marginBottom: 12 }} />}
      <Spin spinning={predLoading}>
        {predData ? (
          <>
            <div className="osa-pred-header">
              <RocketOutlined style={{ fontSize: 24, color: '#1677ff' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>订单 {predData.orderNo}</div>
                <div style={{ fontSize: 13, color: '#8c8c8c' }}>
                  剩余 {predData.remainingQty} 件 · 日均速度 {predData.dailyVelocity} 件/天
                </div>
              </div>
            </div>
            <div className="osa-pred-dates">
              {[
                { cls: 'optimistic', icon: '🟢', label: '乐观', value: predData.optimisticDate },
                { cls: 'realistic', icon: '🔵', label: '最可能', value: predData.realisticDate },
                { cls: 'pessimistic', icon: '🔴', label: '悲观', value: predData.pessimisticDate },
              ].map(d => (
                <div key={d.cls} className={`osa-date-card ${d.cls}`}>
                  <div className="osa-date-label">{d.icon} {d.label}</div>
                  <div className="osa-date-value">{d.value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 13 }}>预测置信度</span>
              <Progress percent={predData.confidence} strokeColor={confColor} style={{ flex: 1 }} />
            </div>
            <div className="osa-rationale"><Tag color="blue">分析依据</Tag>{predData.rationale}</div>
          </>
        ) : !predLoading && <Empty description="输入订单ID后点击「智能分析」获取预测" />}
      </Spin>
    </div>
  );
};

export default OrderSmartAnalysisPanel;
