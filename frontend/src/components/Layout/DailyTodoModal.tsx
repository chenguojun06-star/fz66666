/**
 * 智能运营日报弹窗（v2.0）
 * - 每天 09:30 自动弹出（或当天 09:30-11:00 之间首次打开系统时补弹）
 * - 当天已显示过则不再重复弹出（localStorage 记录日期）
 * - 不点关闭不消失，必须手动确认
 *
 * 包含：核心指标卡片 · 7日趋势折线图 · 决策卡片（问题+方案） · AI建议
 */
import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { Button, Spin, Tag } from 'antd';
import {
  ExclamationCircleOutlined,
  WarningOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  BulbOutlined,
  RightOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ResizableModal from '@/components/common/ResizableModal';
import api, { ApiResult } from '../../utils/api';

const ReactECharts = lazy(() => import('echarts-for-react'));

// ── 类型 ──────────────────────────────────────────────────────────────
interface TrendPoint {
  date: string;
  scanCount: number;
  warehousingCount: number;
  orderCount: number;
}

interface DecisionCard {
  level: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  summary: string;
  painPoint: string;
  confidence: number;
  source: string;
  evidence: string[];
  execute: boolean;
  actionLabel: string;
  actionPath: string;
}

interface TopPriorityOrder {
  orderNo: string;
  styleNo: string;
  factoryName: string;
  progress: number;
  daysLeft: number;
}

interface BriefData {
  date: string;
  overdueOrderCount: number;
  highRiskOrderCount: number;
  yesterdayWarehousingCount: number;
  yesterdayWarehousingQuantity: number;
  todayScanCount: number;
  weekScanCount: number;
  weekWarehousingCount: number;
  todayOrderCount: number;
  todayOrderQuantity: number;
  topPriorityOrder?: TopPriorityOrder;
  suggestions: string[];
  suggestionsSource?: string;
  decisionCards?: DecisionCard[];
  trendData?: TrendPoint[];
  pendingItems?: TopPriorityOrder[];
}

// ── 弹窗时间控制 ────────────────────────────────────────────────────
const STORAGE_KEY = 'daily_todo_shown_date';
const todayStr = () => new Date().toLocaleDateString('zh-CN');
const hasShownToday = () => localStorage.getItem(STORAGE_KEY) === todayStr();
const markShownToday = () => localStorage.setItem(STORAGE_KEY, todayStr());

const isInPopupWindow = () => {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= 9 * 60 + 30 && mins <= 11 * 60;
};

// ── 颜色常量 ─────────────────────────────────────────────────────────
const LEVEL_COLOR: Record<string, string> = {
  danger: '#ff4d4f', warning: '#fa8c16', info: '#1677ff', success: '#52c41a',
};

const LEVEL_BG: Record<string, string> = {
  danger: '#fff1f0', warning: '#fff7e6', info: '#e6f4ff', success: '#f6ffed',
};

const LEVEL_BORDER: Record<string, string> = {
  danger: '#ffa39e', warning: '#ffd591', info: '#91caff', success: '#b7eb8f',
};

// ── 子组件：核心指标卡片 ──────────────────────────────────────────────
const MetricCard: React.FC<{
  label: string; value: number; suffix?: string; color: string; bg: string;
}> = ({ label, value, suffix = '', color, bg }) => (
  <div style={{
    flex: 1, minWidth: 0, padding: '12px 14px', borderRadius: 8,
    background: bg, textAlign: 'center',
  }}>
    <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.2 }}>
      {Number(value) || 0}{suffix}
    </div>
    <div style={{ fontSize: 12, color: '#595959', marginTop: 4 }}>{label}</div>
  </div>
);

// ── 子组件：决策卡片（问题+方案+行动） ────────────────────────────────
const DecisionCardRow: React.FC<{
  card: DecisionCard; onNav: (path: string) => void;
}> = ({ card, onNav }) => {
  const borderColor = LEVEL_BORDER[card.level] || '#d9d9d9';
  const bgColor = LEVEL_BG[card.level] || '#fafafa';
  const accentColor = LEVEL_COLOR[card.level] || '#595959';

  return (
    <div style={{
      borderRadius: 8, border: `1px solid ${borderColor}`,
      background: bgColor, padding: '14px 16px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Tag color={card.level === 'danger' ? 'error' : card.level === 'warning' ? 'warning' : card.level === 'success' ? 'success' : 'processing'} style={{ margin: 0 }}>
          {card.level === 'danger' ? '紧急' : card.level === 'warning' ? '注意' : card.level === 'success' ? '良好' : '提示'}
        </Tag>
        <span style={{ fontWeight: 600, fontSize: 14, color: '#141414' }}>{card.title}</span>
        {card.confidence > 0 && (
          <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 'auto' }}>
            置信度 {card.confidence}%
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: '#262626', lineHeight: 1.6, marginBottom: 6 }}>
        {card.summary}
      </div>
      {card.painPoint && (
        <div style={{ fontSize: 12, color: accentColor, marginBottom: 6 }}>
          <BulbOutlined style={{ marginRight: 4 }} />
          建议：{card.painPoint}
        </div>
      )}
      {card.evidence?.length > 0 && (
        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>
          {card.evidence.slice(0, 3).map((e, i) => (
            <div key={i} style={{ marginBottom: 2 }}>· {e}</div>
          ))}
        </div>
      )}
      {card.actionLabel && card.actionPath && (
        <div
          onClick={() => onNav(card.actionPath)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 13, color: 'var(--primary-color)', cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          {card.actionLabel} <RightOutlined style={{ fontSize: 10 }} />
        </div>
      )}
    </div>
  );
};

// ── 趋势图配置构建 ────────────────────────────────────────────────────
function buildTrendOption(trend: TrendPoint[]) {
  const dates = trend.map(t => t.date);
  const scans = trend.map(t => Number(t.scanCount) || 0);
  const wh = trend.map(t => Number(t.warehousingCount) || 0);
  const orders = trend.map(t => Number(t.orderCount) || 0);

  return {
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e8e8e8',
      textStyle: { fontSize: 12, color: '#333' },
    },
    legend: {
      data: ['扫码次数', '入库单数', '下单数'],
      bottom: 0, textStyle: { fontSize: 11 }, itemWidth: 16, itemHeight: 8,
    },
    grid: { left: 36, right: 16, top: 10, bottom: 32, containLabel: false },
    xAxis: {
      type: 'category' as const, data: dates, boundaryGap: false,
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisLabel: { fontSize: 11, color: '#8c8c8c' },
    },
    yAxis: {
      type: 'value' as const, splitLine: { lineStyle: { color: '#f5f5f5' } },
      axisLabel: { fontSize: 11, color: '#8c8c8c' },
    },
    series: [
      {
        name: '扫码次数', type: 'line', data: scans, smooth: true,
        symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 2, color: '#1677ff' },
        itemStyle: { color: '#1677ff' },
        areaStyle: { color: 'rgba(22,119,255,0.08)' },
      },
      {
        name: '入库单数', type: 'line', data: wh, smooth: true,
        symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 2, color: '#52c41a' },
        itemStyle: { color: '#52c41a' },
        areaStyle: { color: 'rgba(82,196,26,0.08)' },
      },
      {
        name: '下单数', type: 'line', data: orders, smooth: true,
        symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 2, color: '#fa8c16' },
        itemStyle: { color: '#fa8c16' },
        areaStyle: { color: 'rgba(250,140,22,0.08)' },
      },
    ],
  };
}

// ── 健康等级判定 ──────────────────────────────────────────────────────
function getHealthLevel(brief: BriefData): { label: string; color: string; tagColor: string } {
  const overdue = Number(brief.overdueOrderCount) || 0;
  const risk = Number(brief.highRiskOrderCount) || 0;
  if (overdue > 3 || risk > 5) return { label: '需紧急处理', color: '#ff4d4f', tagColor: 'error' };
  if (overdue > 0 || risk > 2) return { label: '有待办需关注', color: '#fa8c16', tagColor: 'warning' };
  if (risk > 0) return { label: '整体可控', color: '#1677ff', tagColor: 'processing' };
  return { label: '运行良好', color: '#52c41a', tagColor: 'success' };
}

// ── 趋势箭头 ──────────────────────────────────────────────────────────
function TrendArrow({ trend }: { trend: TrendPoint[] }) {
  if (!trend || trend.length < 2) return null;
  const last = Number(trend[trend.length - 1]?.scanCount) || 0;
  const prev = Number(trend[trend.length - 2]?.scanCount) || 0;
  if (prev === 0) return null;
  const pct = Math.round(((last - prev) / prev) * 100);
  if (pct === 0) return null;
  const up = pct > 0;
  return (
    <span style={{ fontSize: 12, color: up ? '#52c41a' : '#ff4d4f', marginLeft: 6 }}>
      {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(pct)}%
    </span>
  );
}

// ── 主组件 ─────────────────────────────────────────────────────────────
const DailyTodoModal: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchBrief = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const res = await api.get('/dashboard/daily-brief', {
        timeout: 8000, signal: ac.signal,
      }) as ApiResult<BriefData>;
      if (!ac.signal.aborted && res.code === 200) setBrief(res.data ?? null);
    } catch { /* 网络失败仍弹出 */ } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  const tryShow = useCallback(() => {
    if (hasShownToday() || !isInPopupWindow()) return;
    fetchBrief();
    setOpen(true);
  }, [fetchBrief]);

  useEffect(() => {
    tryShow();
    const timer = setInterval(tryShow, 60 * 1000);
    return () => { clearInterval(timer); abortRef.current?.abort(); };
  }, [tryShow]);

  const handleClose = () => { markShownToday(); setOpen(false); };
  const handleNav = (path: string) => { handleClose(); navigate(path); };

  const health = brief ? getHealthLevel(brief) : null;
  const trend = brief?.trendData ?? [];
  const cards = brief?.decisionCards ?? [];
  const suggestions = brief?.suggestions ?? [];

  return (
    <ResizableModal
      open={open}
      title={null}
      footer={
        <div style={{ textAlign: 'center', padding: '4px 0' }}>
          <Button type="primary" size="large" style={{ minWidth: 160 }} onClick={handleClose}>
            已了解，开始工作
          </Button>
        </div>
      }
      closable={false}
      maskClosable={false}
      keyboard={false}
      width="60vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
      centered
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin spinning tip="正在分析生产数据..."><div /></Spin>
        </div>
      ) : brief ? (
        <div style={{ padding: '0 4px' }}>
          {/* ── 头部：问候 + 日期 + 健康状态 ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#141414' }}>
                ☀️ 早上好，今日生产运营简报
              </div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
                {brief.date} · 数据已实时同步
                {brief.suggestionsSource === 'ai' && (
                  <Tag color="purple" style={{ marginLeft: 8, fontSize: 11 }}>
                    <RobotOutlined /> AI 增强
                  </Tag>
                )}
              </div>
            </div>
            {health && (
              <Tag color={health.tagColor} style={{ fontSize: 13, padding: '2px 12px' }}>
                {health.label}
              </Tag>
            )}
          </div>

          {/* ── 核心指标卡片 ── */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <MetricCard
              label="逾期订单" color="#ff4d4f" bg="#fff1f0"
              value={Number(brief.overdueOrderCount) || 0} suffix="单"
            />
            <MetricCard
              label="高风险订单" color="#fa8c16" bg="#fff7e6"
              value={Number(brief.highRiskOrderCount) || 0} suffix="单"
            />
            <MetricCard
              label="今日扫码" color="#1677ff" bg="#e6f4ff"
              value={Number(brief.todayScanCount) || 0} suffix="次"
            />
            <MetricCard
              label="昨日入库" color="#52c41a" bg="#f6ffed"
              value={Number(brief.yesterdayWarehousingCount) || 0} suffix="单"
            />
          </div>

          {/* ── 7日趋势折线图 ── */}
          {trend.length > 1 && (
            <div style={{
              background: '#fafafa', borderRadius: 8, padding: '12px 14px',
              marginBottom: 16, border: '1px solid #f0f0f0',
            }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8,
                display: 'flex', alignItems: 'center',
              }}>
                📈 近7日生产趋势
                <TrendArrow trend={trend} />
              </div>
              <Suspense fallback={
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spin size="small" />
                </div>
              }>
                <ReactECharts
                  option={buildTrendOption(trend)}
                  style={{ height: 180 }}
                  opts={{ renderer: 'svg' }}
                />
              </Suspense>
            </div>
          )}

          {/* ── 决策卡片：问题 + 方案 + 行动 ── */}
          {cards.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8 }}>
                🎯 今日需要解决的问题
              </div>
              {cards.map((card, i) => (
                <DecisionCardRow key={i} card={card} onNav={handleNav} />
              ))}
            </div>
          )}

          {/* ── 无决策卡片时的兜底摘要 ── */}
          {cards.length === 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8 }}>
                🎯 今日重点关注
              </div>
              {(Number(brief.overdueOrderCount) || 0) > 0 && (
                <ActionRow
                  icon={<ExclamationCircleOutlined />} color="#ff4d4f"
                  title={`${brief.overdueOrderCount} 单逾期 — 需立即联系工厂确认进度并推动出货`}
                  path="/production/progress-detail" onNav={handleNav}
                />
              )}
              {(Number(brief.highRiskOrderCount) || 0) > 0 && (
                <ActionRow
                  icon={<WarningOutlined />} color="#fa8c16"
                  title={`${brief.highRiskOrderCount} 单高风险 — 7天内截止但进度不足50%，今日必须跟进`}
                  path="/production/progress-detail" onNav={handleNav}
                />
              )}
              {(Number(brief.overdueOrderCount) || 0) === 0 &&
               (Number(brief.highRiskOrderCount) || 0) === 0 && (
                <div style={{
                  padding: '12px 14px', borderRadius: 8, background: '#f6ffed',
                  border: '1px solid #b7eb8f', fontSize: 13, color: '#389e0d',
                }}>
                  ✅ 当前订单健康度良好，保持日常巡检，重点关注新开单进度
                </div>
              )}
            </div>
          )}

          {/* ── AI 智能建议 ── */}
          {suggestions.length > 0 && (
            <div style={{
              background: '#f9f0ff', borderRadius: 8, padding: '12px 16px',
              border: '1px solid #d3adf7', marginBottom: 4,
            }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: '#531dab', marginBottom: 6,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <RobotOutlined /> 智能运营建议
              </div>
              {suggestions.map((s, i) => (
                <div key={i} style={{
                  fontSize: 13, color: '#262626', lineHeight: 1.7,
                  paddingLeft: 12, position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', left: 0, top: 3,
                    width: 5, height: 5, borderRadius: '50%',
                    background: '#722ed1',
                  }} />
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#8c8c8c' }}>
          数据加载中，请稍后
        </div>
      )}
    </ResizableModal>
  );
};

// ── 兜底行动行（无决策卡片时使用） ────────────────────────────────────
const ActionRow: React.FC<{
  icon: React.ReactNode; color: string; title: string;
  path: string; onNav: (p: string) => void;
}> = ({ icon, color, title, path, onNav }) => (
  <div
    onClick={() => onNav(path)}
    style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      borderRadius: 8, background: '#fafafa', border: '1px solid #f0f0f0',
      marginBottom: 8, cursor: 'pointer', transition: 'background 0.15s',
    }}
    onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = '#f0f5ff')}
    onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = '#fafafa')}
  >
    <span style={{ fontSize: 16, color }}>{icon}</span>
    <span style={{ flex: 1, fontSize: 13, color: '#262626' }}>{title}</span>
    <RightOutlined style={{ fontSize: 11, color: '#bfbfbf' }} />
  </div>
);

export default DailyTodoModal;
