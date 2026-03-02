import React, { useState, useCallback } from 'react';
import { Input, Button, Spin, Alert, Tag, Card, Row, Col, Progress, DatePicker } from 'antd';
import { ScheduleOutlined, ThunderboltOutlined, RobotOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { SchedulingSuggestionResponse, SchedulePlan, GanttItem } from '@/services/production/productionApi';
import dayjs from 'dayjs';

const STAGE_COLORS: Record<string, string> = {
  '采购': '#1890ff', '裁剪': '#2f54eb', '车缝': '#722ed1',
  '尾部': '#eb2f96', '质检': '#fa8c16', '入库': '#52c41a',
  '二次工艺': '#13c2c2', '后整': '#faad14',
};

const SchedulingSuggestionPanel: React.FC = () => {
  const [styleNo, setStyleNo] = useState('');
  const [quantity, setQuantity] = useState('');
  const [deadline, setDeadline] = useState('');
  const [data, setData] = useState<SchedulingSuggestionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiAdvice, setAiAdvice] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const handleAiAdvice = async () => {
    if (!data) return;
    setAiLoading(true);
    setAiAdvice('');
    setAiError('');
    try {
      const planSummary = data.plans?.[0]
        ? `最优方案天数${data.plans[0].totalDays || '?'}天，工厂${data.plans[0].factoryName || '?'}，产能利用率${((data.plans[0].capacityUtilization ?? 0) * 100).toFixed(0)}%`
        : '暂无方案';
      const question = `款号${styleNo}，数量${quantity}件，${deadline ? '交期' + deadline + '，' : ''}排产建议：${planSummary}。请评估方案合理性，给出2-3条排产执行优化建议。`;
      const res = await intelligenceApi.aiAdvisorChat(question) as any;
      const answer = res?.data?.answer || res?.answer || '';
      answer ? setAiAdvice(answer) : setAiError('未收到 AI 回复，请稍后重试');
    } catch (e: any) {
      setAiError(e?.message || 'AI 请求失败');
    } finally {
      setAiLoading(false);
    }
  };

  const submit = useCallback(async () => {
    if (!styleNo || !quantity) return;
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.suggestScheduling({
        styleNo,
        quantity: Number(quantity),
        deadline: deadline || undefined,
      }) as any;
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.message || '排产建议失败');
    } finally {
      setLoading(false);
    }
  }, [styleNo, quantity, deadline]);

  const renderGantt = (items: GanttItem[]) => {
    if (!items || items.length === 0) return null;
    const allDates = items.flatMap(i => [i.startDate, i.endDate]).filter(Boolean).sort();
    const minDate = dayjs(allDates[0]);
    const maxDate = dayjs(allDates[allDates.length - 1]);
    const totalDays = Math.max(maxDate.diff(minDate, 'day'), 1);

    return (
      <div className="gantt-chart">
        {items.map((item, idx) => {
          const left = Math.max(0, dayjs(item.startDate).diff(minDate, 'day') / totalDays * 100);
          const width = Math.max(5, dayjs(item.endDate).diff(dayjs(item.startDate), 'day') / totalDays * 100);
          const color = STAGE_COLORS[item.stage] || '#8c8c8c';
          return (
            <div key={idx} className="gantt-row">
              <span className="gantt-label">{item.stage}</span>
              <div className="gantt-track">
                <div
                  className="gantt-bar"
                  style={{ left: `${left}%`, width: `${width}%`, background: color }}
                  title={`${item.stage}: ${item.startDate} → ${item.endDate}`}
                />
              </div>
            </div>
          );
        })}
        <div className="gantt-axis">
          <span>{allDates[0]?.slice(5)}</span>
          <span>{allDates[allDates.length - 1]?.slice(5)}</span>
        </div>
      </div>
    );
  };

  const renderPlan = (plan: SchedulePlan, idx: number) => (
    <Card key={idx} size="small" style={{ marginBottom: 12 }}
      title={<span><ThunderboltOutlined /> {plan.factoryName}</span>}
      extra={<Tag color={plan.capacityUtilization >= 80 ? 'red' : plan.capacityUtilization >= 50 ? 'orange' : 'green'}>
        产能 {plan.capacityUtilization}%
      </Tag>}
    >
      <Row gutter={16}>
        <Col span={8}>
          <div style={{ fontSize: 12, color: '#999' }}>预计完工</div>
          <div style={{ fontWeight: 600 }}>{plan.estimatedEnd || '-'}</div>
        </Col>
        <Col span={8}>
          <div style={{ fontSize: 12, color: '#999' }}>产能利用</div>
          <Progress percent={plan.capacityUtilization} size="small" strokeColor={plan.capacityUtilization >= 80 ? '#f5222d' : '#1890ff'} />
        </Col>
        <Col span={8}>
          <div style={{ fontSize: 12, color: '#999' }}>推荐指数</div>
          <div style={{ fontWeight: 600, color: '#1890ff' }}>★ {plan.capacityUtilization < 60 ? '优先' : '可选'}</div>
        </Col>
      </Row>
      {plan.gantt && plan.gantt.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {renderGantt(plan.gantt)}
        </div>
      )}
    </Card>
  );

  return (
    <div className="intelligence-panel scheduling-panel">
      <div className="scheduling-input-row">
        <Input
          placeholder="款号 (styleNo)"
          value={styleNo}
          onChange={e => setStyleNo(e.target.value)}
          style={{ width: 160 }}
        />
        <Input
          placeholder="数量"
          type="number"
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          style={{ width: 120 }}
        />
        <DatePicker
          placeholder="交期"
          onChange={(_d, ds) => setDeadline(ds as string)}
          style={{ width: 160 }}
        />
        <Button type="primary" icon={<ScheduleOutlined />} onClick={submit} loading={loading}>
          生成排产建议
        </Button>
      </div>

      {loading && <Spin style={{ display: 'block', padding: 40, textAlign: 'center' }} />}
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}

      {data && !loading && (
        <div className="scheduling-results">
          {data.plans && data.plans.length > 0 ? (
            data.plans.map((p, i) => renderPlan(p, i))
          ) : (
            <Alert type="info" message="暂无合适排产方案" showIcon />
          )}
          <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
            <Button icon={<RobotOutlined />} loading={aiLoading} onClick={handleAiAdvice} type="primary" ghost size="small">
              AI 评估方案
            </Button>
            {aiError && <Alert type="error" message={aiError} showIcon style={{ marginTop: 10 }} />}
            {aiAdvice && !aiError && (
              <Alert type="info" message="AI 排产优化建议"
                description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>{aiAdvice}</pre>}
                showIcon icon={<RobotOutlined />} style={{ marginTop: 10 }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulingSuggestionPanel;
