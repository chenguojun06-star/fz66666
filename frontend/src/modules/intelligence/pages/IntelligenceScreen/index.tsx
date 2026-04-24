import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Tooltip } from 'antd';
import {
  SyncOutlined, CloseOutlined, ThunderboltOutlined,
  AlertOutlined, TeamOutlined, SafetyOutlined,
} from '@ant-design/icons';
import { useCockpit } from '../IntelligenceCenter/hooks/useCockpit';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import './styles.css';

/* ─── 小工具 ─────────────────────────────────────────── */

function KpiCard({ label, value, unit, color, icon }: {
  label: string; value: string | number; unit?: string;
  color?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="screen-kpi-card">
      <div className="screen-kpi-icon" style={{ color: color || '#36cfc9' }}>{icon}</div>
      <div className="screen-kpi-value" style={{ color: color || '#36cfc9' }}>
        {value}<span className="screen-kpi-unit">{unit}</span>
      </div>
      <div className="screen-kpi-label">{label}</div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, { color: string; label: string }> = {
    critical: { color: '#ff7875', label: '高危' },
    high:     { color: '#fa8c16', label: '高风险' },
    medium:   { color: '#fadb14', label: '关注' },
    low:      { color: '#52c41a', label: '正常' },
  };
  const { color, label } = map[level] || map.low;
  return <span style={{ color, fontSize: 12, fontWeight: 600 }}>{label}</span>;
}

/* ─── 主组件 ─────────────────────────────────────────── */

export default function IntelligenceScreen() {
  const navigate = useNavigate();
  const { data, load } = useCockpit() as any;
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* 手动刷新 */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  /* 30s 自动刷新 */
  React.useEffect(() => {
    timerRef.current = setInterval(handleRefresh, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [handleRefresh]);

  const brain    = data?.brain;
  const pulse    = data?.pulse;
  const ranking  = data?.ranking;
  const risks    = data?.health;
  const notify   = data?.notify;
  const orders   = data?.orders ?? [];
  const shortage = data?.shortage;

  /* KPI 提取 */
  const todayScan    = pulse?.recentPoints?.reduce((s: number, p: any) => s + (p.count || 0), 0) || 0;
  const healthIdx    = brain?.healthIndex ?? risks?.currentIndex ?? '--';
  const activeWks    = brain?.activeWorkers ?? '--';
  const riskOrders   = brain?.highRiskOrderCount ?? '--';

  return (
    <div className="screen-root">
      {/* 顶部标题栏 */}
      <header className="screen-header">
        <div className="screen-header-left">
          <ThunderboltOutlined style={{ color: '#36cfc9', fontSize: 20 }} />
          <span className="screen-title">智能运营大屏</span>
          <span className="screen-subtitle">实时生产态势 · 30s 自动刷新</span>
        </div>
        <div className="screen-header-right">
          <span className="screen-ts">{data?.ts ? new Date(data.ts).toLocaleTimeString('zh-CN') : '--:--:--'}</span>
          <Tooltip title="立即刷新">
            <SyncOutlined
              spin={refreshing || data?.loading}
              onClick={handleRefresh}
              style={{ fontSize: 18, color: '#36cfc9', cursor: 'pointer', marginLeft: 16 }}
            />
          </Tooltip>
          <Tooltip title="退出大屏">
            <CloseOutlined
              onClick={() => navigate(-1)}
              style={{ fontSize: 18, color: '#aaa', cursor: 'pointer', marginLeft: 16 }}
            />
          </Tooltip>
        </div>
      </header>

      {data?.loading && !data?.ts ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <Spin size="large" spinning tip="加载中..."><div /></Spin>
        </div>
      ) : (
        <main className="screen-main">

          {/* KPI 行 */}
          <section className="screen-kpi-row">
            <KpiCard label="今日扫码" value={todayScan} unit="次"
              color="#36cfc9" icon={<ThunderboltOutlined />} />
            <KpiCard label="健康指数" value={healthIdx} unit="/100"
              color={Number(healthIdx) >= 70 ? '#52c41a' : '#fa8c16'} icon={<SafetyOutlined />} />
            <KpiCard label="活跃工人" value={activeWks} unit="人"
              color="#9254de" icon={<TeamOutlined />} />
            <KpiCard label="高风险订单" value={riskOrders} unit="单"
              color={Number(riskOrders) > 0 ? '#ff7875' : '#52c41a'} icon={<AlertOutlined />} />
            <KpiCard label="物料缺口" value={shortage?.items?.length ?? 0} unit="项"
              color={shortage?.items?.length > 0 ? '#fa8c16' : '#52c41a'} icon={<AlertOutlined />} />
          </section>

          {/* 三列内容区 */}
          <div className="screen-body">

            {/* 左列：工厂排行 */}
            <div className="screen-col">
              <div className="screen-panel-title"> 工厂产能排行</div>
              {ranking?.ranks?.length ? (
                ranking.ranks.slice(0, 8).map((r: any, i: number) => (
                  <div key={r.factoryName} className="screen-rank-row">
                    <span className="screen-rank-no"
                      style={{ color: i < 3 ? ['#ffd700','#c0c0c0','#cd7f32'][i] : '#aaa' }}>
                      #{i + 1}
                    </span>
                    <span className="screen-rank-name">{r.factoryName}</span>
                    <div className="screen-rank-bar-wrap">
                      <div className="screen-rank-bar"
                        style={{ width: `${Math.min(100, r.completionRate || 0)}%` }} />
                    </div>
                    <span className="screen-rank-pct">{r.completionRate ?? 0}%</span>
                  </div>
                ))
              ) : (
                <div className="screen-empty">暂无排名数据</div>
              )}
            </div>

            {/* 中列：进行中订单 */}
            <div className="screen-col">
              <div className="screen-panel-title"> 进行中订单</div>
              {orders.slice(0, 10).map((o: any) => {
                const prog = calcOrderProgress(o);
                return (
                <div key={o.id || o.orderNo} className="screen-order-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.styleName}
                  </span>
                  <div className="screen-progress-bar-wrap">
                    <div className="screen-progress-bar"
                      style={{
                        width: `${prog}%`,
                        background: prog >= 80 ? '#52c41a'
                          : prog >= 40 ? '#fadb14' : '#ff7875',
                      }} />
                  </div>
                  <span className="screen-progress-pct">{prog}%</span>
                </div>
                );
              })}
              {!orders.length && <div className="screen-empty">无进行中订单</div>}
            </div>

            {/* 右列：智能通知 & 物料缺口 */}
            <div className="screen-col">
              <div className="screen-panel-title"> 智能提醒</div>
              {notify?.items?.length ? (
                notify.items.slice(0, 6).map((n: any, i: number) => (
                  <div key={i} className="screen-notify-row">
                    <RiskBadge level={n.level || 'low'} />
                    <span style={{ marginLeft: 8, fontSize: 13, color: '#ddd' }}>{n.message}</span>
                  </div>
                ))
              ) : (
                <div className="screen-empty">暂无智能提醒</div>
              )}

              {shortage?.items?.length > 0 && (
                <>
                  <div className="screen-panel-title" style={{ marginTop: 24 }}> 物料缺口</div>
                  {shortage.items.slice(0, 5).map((m: any, i: number) => (
                    <div key={i} className="screen-notify-row">
                      <span style={{ color: '#fa8c16', fontSize: 12 }}>缺</span>
                      <span style={{ marginLeft: 6, fontSize: 13, color: '#ddd' }}>
                        {m.materialName} · 缺 {m.shortageQty}{m.unit}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>

          </div>
        </main>
      )}
    </div>
  );
}
