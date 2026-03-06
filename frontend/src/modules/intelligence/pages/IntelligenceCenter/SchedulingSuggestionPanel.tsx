import React, { useState, useCallback } from 'react';
import { Input, Tag } from 'antd';
import { CalendarOutlined, SearchOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { SchedulingSuggestionResponse, SchedulePlan, GanttItem } from '@/services/production/productionApi';

const GANTT_COLORS = ['#00e5ff', '#39ff14', '#a78bfa', '#f7a600', '#ffd700', '#ff8c00', '#ff4136'];

/** 排程建议面板 */
const SchedulingSuggestionPanel: React.FC = () => {
  const [styleNo, setStyleNo]   = useState('');
  const [quantity, setQuantity] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SchedulingSuggestionResponse | null>(null);
  const [error, setError] = useState('');

  // 设置默认 deadline 为 30 天后
  const today = new Date();
  const defaultDeadline = new Date(today.getTime() + 30 * 24 * 3600000)
    .toISOString().slice(0, 10);

  const handleSearch = useCallback(async () => {
    const s = styleNo.trim();
    const q = Number(quantity);
    if (!s || !q) {
      setError('请输入款号和生产件数');
      return;
    }
    const dl = deadline.trim() || defaultDeadline;
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.suggestScheduling({ styleNo: s, quantity: q, deadline: dl }) as any;
      const d: SchedulingSuggestionResponse = res?.data ?? res;
      setData(d);
      if (!d?.plans?.length) setError('暂无可排程工厂数据');
    } catch {
      setError('排程分析失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [styleNo, quantity, deadline, defaultDeadline]);

  const plans: SchedulePlan[] = data?.plans ?? [];

  // 计算甘特图色块宽度（相对于该计划总天数）
  const ganttBarWidth = (days: number, totalDays: number) =>
    `${Math.max(4, Math.round((days / Math.max(totalDays, 1)) * 100))}%`;

  return (
    <div className="c-card">
      <div className="c-card-title">
        <CalendarOutlined style={{ marginRight: 6, color: '#f7a600' }} />
        AI 自动排程建议
        <span className="c-card-badge" style={{ background: 'rgba(247,166,0,0.15)', color: '#f7a600', borderColor: '#f7a600' }}>
          工序排期甘特图
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4a6d8a' }}>
          输入款号 + 件数 → AI 生成各工厂排程计划
        </span>
      </div>

      {/* 搜索栏 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#4a6d8a' }} />}
          placeholder="款号"
          value={styleNo}
          onChange={e => setStyleNo(e.target.value)}
          onPressEnter={handleSearch}
          style={{
            width: 160, background: 'rgba(247,166,0,0.05)',
            border: '1px solid rgba(247,166,0,0.2)', color: '#e2f0ff',
          }}
        />
        <Input
          placeholder="件数"
          value={quantity}
          onChange={e => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
          style={{
            width: 100, background: 'rgba(247,166,0,0.05)',
            border: '1px solid rgba(247,166,0,0.2)', color: '#e2f0ff',
          }}
        />
        <Input
          type="date"
          placeholder="截止日期"
          value={deadline || defaultDeadline}
          onChange={e => setDeadline(e.target.value)}
          style={{
            width: 150, background: 'rgba(247,166,0,0.05)',
            border: '1px solid rgba(247,166,0,0.2)', color: '#e2f0ff',
          }}
        />
        <button
          disabled={loading}
          onClick={handleSearch}
          className="c-panel-btn c-panel-btn--orange"
        >
          <CalendarOutlined />
          {loading ? '生成中…' : '生成排程'}
        </button>
      </div>

      {error && <div className="c-empty" style={{ color: '#f7a600' }}>{error}</div>}
      {!data && !loading && !error && (
        <div className="c-empty">输入款号与件数，AI 将根据各工厂历史效率自动生成最优排程方案</div>
      )}

      {plans.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {plans.map((plan, pi) => (
            <div key={plan.factoryId ?? pi} style={{
              background: 'rgba(247,166,0,0.04)',
              border: '1px solid rgba(247,166,0,0.15)',
              borderRadius: 8, padding: '14px 16px',
            }}>
              {/* 工厂标题 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ color: '#e2f0ff', fontWeight: 700, fontSize: 14 }}>
                  🏭 {plan.factoryName}
                </span>
                <Tag style={{ background: 'rgba(247,166,0,0.15)', color: '#f7a600', borderColor: '#f7a600' }}>
                  {plan.totalDays} 天完工
                </Tag>
                <Tag style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff', borderColor: '#00e5ff' }}>
                  预计 {plan.estimatedEnd?.slice(0, 10)}
                </Tag>
                <Tag style={{
                  background: plan.capacityUtilization > 85
                    ? 'rgba(255,65,54,0.15)' : 'rgba(57,255,20,0.1)',
                  color: plan.capacityUtilization > 85 ? '#ff4136' : '#39ff14',
                  borderColor: plan.capacityUtilization > 85 ? '#ff4136' : '#39ff14',
                }}>
                  产能 {plan.capacityUtilization}%
                </Tag>
              </div>

              {/* 甘特图 */}
              {plan.ganttItems && plan.ganttItems.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: '#7fa8c4', marginBottom: 6 }}>工序排期（横向甘特图）</div>
                  {(() => {
                    const totalDays = plan.ganttItems.reduce((s, g) => s + g.days, 0) || plan.estimatedDays || 1;
                    return plan.ganttItems.map((item: GanttItem, gi: number) => (
                      <div key={item.stage} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <span style={{ color: '#9dc4db', fontSize: 11, minWidth: 56, textAlign: 'right' }}>{item.stage}</span>
                        <div style={{ flex: 1, height: 13, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                          <div style={{
                            width: ganttBarWidth(item.days, totalDays),
                            height: '100%',
                            background: GANTT_COLORS[gi % GANTT_COLORS.length],
                            borderRadius: 3,
                            display: 'flex', alignItems: 'center', paddingLeft: 5,
                            minWidth: 24,
                            opacity: 0.88,
                          }}>
                            <span style={{ fontSize: 10, color: '#000', fontWeight: 700 }}>{item.days}天</span>
                          </div>
                        </div>
                        <span style={{ fontSize: 11, color: '#9dc4db', minWidth: 90, textAlign: 'right' }}>
                          {item.startDate?.slice(5)} ~ {item.endDate?.slice(5)}
                        </span>
                      </div>
                    ));
                  })()}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SchedulingSuggestionPanel;
