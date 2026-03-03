import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Spin, Tag, Input, Button } from 'antd';
import { ThunderboltOutlined, SyncOutlined, RobotOutlined, SendOutlined, DashboardOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type {
  LivePulseResponse, HealthIndexResponse, SmartNotificationResponse,
  WorkerEfficiencyResponse, DefectHeatmapResponse, FactoryLeaderboardResponse,
  MaterialShortageResult, SelfHealingResponse,
} from '@/services/production/productionApi';
import Layout from '@/components/Layout';
import './styles.css';

const risk2color = (r: string) =>
  ({ HIGH: '#ff4d4f', MEDIUM: '#faad14', LOW: '#52c41a' }[r] ?? '#52c41a');
const grade2color = (g: string) =>
  ({ A: '#52c41a', B: '#00e5ff', C: '#faad14', D: '#ff4d4f' }[g] ?? '#999');

const Sparkline: React.FC<{ pts: number[]; color?: string }> = ({ pts, color = '#00e5ff' }) => {
  if (!pts.length) return null;
  const w = 140; const h = 40;
  const max = Math.max(...pts, 1);
  const pts2 = pts.map((v, i) => `${(i / Math.max(pts.length - 1, 1)) * w},${h - (v / max) * (h - 2) - 1}`);
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={pts2.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((v, i) => (
        <circle key={i} cx={(i / Math.max(pts.length - 1, 1)) * w} cy={h - (v / max) * (h - 2) - 1} r={2.5} fill={color} />
      ))}
    </svg>
  );
};

interface CockpitData {
  pulse: LivePulseResponse | null; health: HealthIndexResponse | null;
  notify: SmartNotificationResponse | null; workers: WorkerEfficiencyResponse | null;
  heatmap: DefectHeatmapResponse | null; ranking: FactoryLeaderboardResponse | null;
  shortage: MaterialShortageResult | null; healing: SelfHealingResponse | null;
  loading: boolean;
}

function useCockpit() {
  const [data, setData] = useState<CockpitData>({
    pulse: null, health: null, notify: null, workers: null,
    heatmap: null, ranking: null, shortage: null, healing: null, loading: true,
  });
  const load = useCallback(async () => {
    setData(d => ({ ...d, loading: true }));
    const [rPulse, rHealth, rNotify, rWorkers, rHeatmap, rRanking, rShortage, rHealing] =
      await Promise.allSettled([
        intelligenceApi.getLivePulse(), intelligenceApi.getHealthIndex(),
        intelligenceApi.getSmartNotifications(), intelligenceApi.getWorkerEfficiency(),
        intelligenceApi.getDefectHeatmap(), intelligenceApi.getFactoryLeaderboard(),
        intelligenceApi.getMaterialShortage(), intelligenceApi.runSelfHealing(),
      ]);
    const v = <T,>(r: PromiseSettledResult<{ code: number; data: T } | T>): T | null =>
      r.status === 'fulfilled' ? ((r.value as any)?.data ?? (r.value as T)) : null;
    setData({
      pulse: v(rPulse), health: v(rHealth), notify: v(rNotify), workers: v(rWorkers),
      heatmap: v(rHeatmap), ranking: v(rRanking), shortage: v(rShortage), healing: v(rHealing),
      loading: false,
    });
  }, []);
  useEffect(() => { load(); }, [load]);
  return { data, reload: load };
}

const medalColor = ['#ffd700', '#c0c0c0', '#cd7f32'];

const IntelligenceCenter: React.FC = () => {
  const { data, reload } = useCockpit();
  const [countdown, setCountdown] = useState(30);
  const [chatQ, setChatQ] = useState('');
  const [chatA, setChatA] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c <= 1) { reload(); return 30; } return c - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [reload]);

  const handleReload = () => { reload(); setCountdown(30); };
  const handleChat = async () => {
    if (!chatQ.trim()) return;
    setChatLoading(true); setChatA('');
    try {
      const res = await intelligenceApi.aiAdvisorChat(chatQ) as any;
      setChatA(res?.data?.answer || res?.answer || '暂无回复');
    } catch { setChatA('AI 服务暂不可用，请稍后重试。'); }
    finally { setChatLoading(false); }
  };

  const { pulse, health, notify, workers, heatmap, ranking, shortage, healing } = data;

  return (
    <Layout>
      <div className="cockpit-root">

        {/* ── 顶部标题栏 ── */}
        <div className="cockpit-header">
          <span className="cockpit-title">
            <ThunderboltOutlined style={{ marginRight: 8, color: '#00e5ff' }} />
            智能运营驾驶舱
          </span>
          <span className="cockpit-subtitle">AI 实时决策引擎 · 全链路可视化</span>
          <span className="cockpit-right">
            {data.loading ? <Spin size="small" style={{ marginRight: 8 }} /> : <span className="c-countdown">{countdown}s</span>}
            <Button size="small" icon={<SyncOutlined spin={data.loading} />} className="cockpit-refresh-btn" onClick={handleReload}>刷新</Button>
          </span>
        </div>

        {/* ── 第一行：4 顶部数字卡片 ── */}
        <div className="cockpit-grid-4">
          <div className="c-card c-stat">
            <div className="c-stat-label">今日扫码量</div>
            <div className="c-stat-val" style={{ color: '#00e5ff' }}>{pulse?.todayScanQty?.toLocaleString() ?? '—'}</div>
            <div className="c-stat-sub">件</div>
          </div>
          <div className="c-card c-stat">
            <div className="c-stat-label">活跃工厂</div>
            <div className="c-stat-val" style={{ color: '#76ff03' }}>{pulse?.activeFactories ?? '—'}</div>
            <div className="c-stat-sub">活跃员工 {pulse?.activeWorkers ?? '—'} 人</div>
          </div>
          <div className="c-card c-stat">
            <div className="c-stat-label">供应链健康指数</div>
            <div className="c-stat-val" style={{ color: health ? grade2color(health.grade) : '#555' }}>{health?.healthIndex ?? '—'}</div>
            <div className="c-stat-sub">{health ? <span style={{ color: grade2color(health.grade), fontWeight: 700 }}>{health.grade} 级</span> : '—'}</div>
          </div>
          <div className="c-card c-stat">
            <div className="c-stat-label">待发推送通知</div>
            <div className="c-stat-val" style={{ color: '#faad14' }}>{notify?.pendingCount ?? '—'}</div>
            <div className="c-stat-sub">今日已发 {notify?.sentToday ?? 0} 条</div>
          </div>
        </div>

        {/* ── 第二行：脉搏时间轴 + 工厂排行 ── */}
        <div className="cockpit-grid-2">
          <div className="c-card">
            <div className="c-card-title">🫀 实时生产脉搏</div>
            <div className="c-pulse-stats">
              <span>扫码速率 <b style={{ color: '#00e5ff' }}>{pulse?.scanRatePerHour ?? '—'}</b> 件/时</span>
              <span>活跃员工 <b style={{ color: '#76ff03' }}>{pulse?.activeWorkers ?? '—'}</b> 人</span>
            </div>
            <div style={{ margin: '8px 0' }}>
              <Sparkline pts={(pulse?.timeline ?? []).map(p => p.count)} color="#00e5ff" />
              <div className="c-sparkline-label">{(pulse?.timeline ?? []).map(p => p.time.slice(-5)).join('  ')}</div>
            </div>
            {pulse?.stagnantFactories?.length
              ? <div className="c-alert-row">⚠️ 停滞预警：{pulse.stagnantFactories.map(f =>
                  <Tag key={f.factoryName} color="warning" style={{ marginLeft: 4 }}>{f.factoryName} · {Math.round(f.minutesSilent / 60)}h 无动静</Tag>
                )}</div>
              : <div className="c-ok-row">✅ 所有工厂生产正常</div>}
          </div>
          <div className="c-card">
            <div className="c-card-title">🏆 工厂绩效排行</div>
            {ranking?.rankings?.length
              ? ranking.rankings.slice(0, 5).map((r, i) => (
                <div key={r.factoryId} className="c-rank-row">
                  <span className="c-rank-medal" style={{ color: medalColor[i] ?? '#aaa' }}>{r.medal || `#${r.rank}`}</span>
                  <span className="c-rank-name">{r.factoryName}</span>
                  <div className="c-rank-bar-wrap"><div className="c-rank-bar" style={{ width: `${r.totalScore}%` }} /></div>
                  <span className="c-rank-score" style={{ color: '#00e5ff' }}>{r.totalScore}</span>
                </div>
              ))
              : <div className="c-empty">暂无排行数据</div>}
          </div>
        </div>

        {/* ── 第三行：工人效率 + 缺陷热力图 ── */}
        <div className="cockpit-grid-2">
          <div className="c-card">
            <div className="c-card-title">🕸️ 工人技能雷达</div>
            <table className="c-table">
              <thead><tr><th>姓名</th><th>速度</th><th>质量</th><th>稳定</th><th>多能</th><th>出勤</th><th>综合</th><th></th></tr></thead>
              <tbody>
                {workers?.workers?.slice(0, 6).map(w => (
                  <tr key={w.operatorName}>
                    <td>{w.operatorName}</td>
                    <td style={{ color: w.speedScore >= 80 ? '#76ff03' : '#faad14' }}>{w.speedScore}</td>
                    <td style={{ color: w.qualityScore >= 80 ? '#76ff03' : '#faad14' }}>{w.qualityScore}</td>
                    <td>{w.stabilityScore}</td><td>{w.versatilityScore}</td><td>{w.attendanceScore}</td>
                    <td><b style={{ color: '#00e5ff' }}>{w.overallScore}</b></td>
                    <td>{w.trend === 'UP' ? '📈' : w.trend === 'DOWN' ? '📉' : '➡️'}</td>
                  </tr>
                )) ?? <tr><td colSpan={8} className="c-empty-td">暂无数据</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="c-card">
            <div className="c-card-title">🗺️ 质量缺陷热力图</div>
            {heatmap?.cells?.length ? (
              <>
                <div className="c-heatmap-meta">
                  风险工序：<b style={{ color: '#ff4d4f' }}>{heatmap.worstProcess}</b>
                  &nbsp;·&nbsp;风险工厂：<b style={{ color: '#ff4d4f' }}>{heatmap.worstFactory}</b>
                  &nbsp;·&nbsp;总缺陷 <b style={{ color: '#faad14' }}>{heatmap.totalDefects}</b>
                </div>
                <div className="c-heatmap-grid" style={{ gridTemplateColumns: `72px repeat(${heatmap.factories.length}, 1fr)` }}>
                  <div />
                  {heatmap.factories.map(f => <div key={f} className="c-heat-head">{f}</div>)}
                  {heatmap.processes.map(proc => (
                    <React.Fragment key={proc}>
                      <div className="c-heat-row-label">{proc}</div>
                      {heatmap.factories.map(fac => {
                        const cell = heatmap.cells.find(c => c.process === proc && c.factory === fac);
                        const alpha = cell ? Math.min(cell.intensity, 0.85) : 0;
                        return <div key={fac} className="c-heat-cell" style={{ background: `rgba(255,77,79,${alpha})`, color: alpha > 0.4 ? '#fff' : '#555' }}>{cell?.defectCount || ''}</div>;
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </>
            ) : <div className="c-empty">暂无缺陷数据</div>}
          </div>
        </div>

        {/* ── 第四行：面料缺口 + 异常自愈 ── */}
        <div className="cockpit-grid-5-7">
          <div className="c-card">
            <div className="c-card-title">⚠️ 面料缺口预警</div>
            {shortage?.shortageItems?.length
              ? shortage.shortageItems.slice(0, 5).map(item => (
                <div key={item.materialCode} className="c-shortage-row">
                  <span className="c-shortage-risk" style={{ color: risk2color(item.riskLevel), border: `1px solid ${risk2color(item.riskLevel)}` }}>{item.riskLevel}</span>
                  <span className="c-shortage-name">{item.materialName}</span>
                  <span style={{ color: '#ff4d4f', marginLeft: 'auto' }}>缺 {item.shortageQuantity}{item.unit}</span>
                </div>
              ))
              : <div className="c-ok-row">✅ 面料库存充足，无缺口</div>}
            {shortage?.summary && <div className="c-summary">{shortage.summary}</div>}
          </div>
          <div className="c-card">
            <div className="c-card-title">🔧 异常自愈诊断
              {healing && <span style={{ marginLeft: 8, color: healing.healthScore >= 80 ? '#76ff03' : '#faad14', fontSize: 12 }}>系统健康 {healing.healthScore} 分 · 发现 {healing.issuesFound} 项异常 · 自修 {healing.autoFixed} 项</span>}
            </div>
            {healing?.items?.length
              ? healing.items.slice(0, 6).map((item, i) => (
                <div key={i} className="c-heal-item">
                  <span className={`c-heal-dot ${item.status === 'OK' ? 'dot-ok' : item.autoFixed ? 'dot-fixed' : 'dot-warn'}`} />
                  <span className="c-heal-name">{item.checkName}</span>
                  <span className="c-heal-detail">{item.detail}</span>
                  <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    {item.autoFixed ? <Tag color="success" style={{ fontSize: 11 }}>已自修</Tag>
                      : item.status !== 'OK' ? <Tag color="warning" style={{ fontSize: 11 }}>需处理</Tag>
                      : <Tag style={{ fontSize: 11, color: '#555' }}>正常</Tag>}
                  </span>
                </div>
              ))
              : <div className="c-empty">暂无诊断数据</div>}
          </div>
        </div>

        {/* ── 第五行：AI 顾问对话 ── */}
        <div className="c-card c-chat-card">
          <div className="c-card-title">
            <RobotOutlined style={{ marginRight: 6, color: '#7c4dff' }} />
            AI 智能顾问对话
            <span className="c-chat-hint"> — 询问任何关于生产、订单、库存、财务的问题</span>
          </div>
          <div className="c-chat-row">
            <Input className="c-chat-input"
              placeholder="例如：今天哪个工厂效率最高？本月有哪些订单有交期风险？"
              value={chatQ} onChange={e => setChatQ(e.target.value)} onPressEnter={handleChat} />
            <Button type="primary" icon={<SendOutlined />} loading={chatLoading}
              onClick={handleChat} className="c-chat-send">发送</Button>
          </div>
          {chatLoading && <div className="c-chat-thinking"><DashboardOutlined spin style={{ marginRight: 6 }} />AI 正在分析数据，请稍候...</div>}
          {chatA && <div className="c-chat-answer">{chatA}</div>}
          <div className="c-chat-suggestions">
            {['今日生产进度如何？', '哪个工厂延期风险最高？', '面料库存是否充足？', '本月利润预估情况？'].map(q => (
              <button key={q} className="c-suggest-btn" onClick={() => setChatQ(q)}>{q}</button>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
};

export default IntelligenceCenter;
