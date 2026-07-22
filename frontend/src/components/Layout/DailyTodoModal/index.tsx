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
  RobotOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ResizableModal from '@/components/common/ResizableModal';
import api, { ApiResult } from '@/utils/api';
import type { BriefData } from './types';
import { LEVEL_COLOR, LEVEL_BG, LEVEL_BORDER } from './constants';
import { hasShownToday, markShownToday, isInPopupWindow, buildTrendOption, getHealthLevel } from './utils';
import MetricCard from './components/MetricCard';
import DecisionCardRow from './components/DecisionCardRow';
import ActionRow from './components/ActionRow';
import TrendArrow from './components/TrendArrow';

const ReactECharts = lazy(() => import('echarts-for-react'));

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
      else if (!ac.signal.aborted) { markShownToday(); setOpen(false); }
    } catch {
      if (!ac.signal.aborted) {
        markShownToday();
        setOpen(false);
      }
    } finally {
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
      closable={true}
      maskClosable={true}
      keyboard={true}
      width="85vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
      centered
      onCancel={handleClose}
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
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
                ☀️ 早上好，今日生产运营简报
              </div>
              <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                {brief.date} · 数据已实时同步
                {brief.suggestionsSource === 'ai' && (
                  <Tag color="purple" style={{ marginLeft: 8, fontSize: 14 }}>
                    <RobotOutlined /> AI 增强
                  </Tag>
                )}
              </div>
            </div>
            {health && (
              <Tag color={health.tagColor} style={{ fontSize: 14, padding: '2px 12px' }}>
                {health.label}
              </Tag>
            )}
          </div>

          {/* ── 核心指标卡片 ── */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <MetricCard
              label="逾期订单" color={LEVEL_COLOR.danger} bg={LEVEL_BG.danger}
              value={Number(brief.overdueOrderCount) || 0} suffix="单"
            />
            <MetricCard
              label="高风险订单" color={LEVEL_COLOR.warning} bg={LEVEL_BG.warning}
              value={Number(brief.highRiskOrderCount) || 0} suffix="单"
            />
            <MetricCard
              label="今日扫码" color={LEVEL_COLOR.info} bg={LEVEL_BG.info}
              value={Number(brief.todayScanCount) || 0} suffix="次"
            />
            <MetricCard
              label="昨日入库" color={LEVEL_COLOR.success} bg={LEVEL_BG.success}
              value={Number(brief.yesterdayWarehousingCount) || 0} suffix="单"
            />
          </div>

          {/* ── 7日趋势折线图 ── */}
          {trend.length > 1 && (
            <div style={{
              background: 'var(--color-bg-container)', borderRadius: 8, padding: '12px 14px',
              marginBottom: 16, border: '1px solid var(--color-border-light)',
            }}>
              <div style={{
                fontSize: 14, fontWeight: 600, color: '#262626', marginBottom: 8,
                display: 'flex', alignItems: 'center',
              }}>
                📈 近7日生产趋势
                <TrendArrow trend={trend} />
              </div>
              <Suspense fallback={
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spin />
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
              <div style={{ fontSize: 14, fontWeight: 600, color: '#262626', marginBottom: 8 }}>
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
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>
                📅 今日关键任务
              </div>
              {(Number(brief.overdueOrderCount) || 0) > 0 && (
                <ActionRow
                  icon={<ExclamationCircleOutlined />} color="var(--color-danger)"
                  title={`${brief.overdueOrderCount} 单逾期 — 需立即联系工厂确认进度并推动出货`}
                  path="/production/progress-detail" onNav={handleNav}
                />
              )}
              {(Number(brief.highRiskOrderCount) || 0) > 0 && (
                <ActionRow
                  icon={<WarningOutlined />} color="var(--color-warning)"
                  title={`${brief.highRiskOrderCount} 单高风险 — 7天内截止但进度不足50%，今日必须跟进`}
                  path="/production/progress-detail" onNav={handleNav}
                />
              )}
              {(Number(brief.overdueOrderCount) || 0) === 0 &&
               (Number(brief.highRiskOrderCount) || 0) === 0 && (
                <div style={{
                  padding: '12px 14px', borderRadius: 8, background: LEVEL_BG.success,
                  border: '1px solid ' + LEVEL_BORDER.success, fontSize: 14, color: LEVEL_COLOR.success,
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
                fontSize: 14, fontWeight: 600, color: '#531dab', marginBottom: 6,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <RobotOutlined /> 智能运营建议
              </div>
              {suggestions.map((s, i) => (
                <div key={i} style={{
                  fontSize: 14, color: 'var(--color-text)', lineHeight: 1.7,
                  paddingLeft: 12, position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', left: 0, top: 3,
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--color-accent-purple)',
                  }} />
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-tertiary)' }}>
          数据加载中，请稍后
        </div>
      )}
    </ResizableModal>
  );
};

export default DailyTodoModal;
