import React, { useState, useCallback } from 'react';
import { Select, Button, InputNumber, Spin, Empty, Tag, Alert } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { SmartAssignmentResponse, WorkerRecommendation } from '@/services/production/productionApi';

const STAGE_OPTIONS = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '质检', '入库'].map(s => ({ label: s, value: s }));

const levelTag: Record<string, { color: string; text: string }> = {
  excellent: { color: 'green', text: '优秀' },
  good: { color: 'blue', text: '良好' },
  normal: { color: 'default', text: '普通' },
};

const WorkerCard: React.FC<{ item: WorkerRecommendation; rank: number }> = ({ item, rank }) => (
  <div className="worker-card">
    <div className={`rank ${rank <= 3 ? 'top' : ''}`}>{rank}</div>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>
        {item.operatorName}
        <Tag color={levelTag[item.level]?.color} style={{ marginLeft: 8 }}>
          {levelTag[item.level]?.text || item.level}
        </Tag>
        <span style={{ float: 'right', fontSize: 20, fontWeight: 700, color: '#1677ff' }}>{item.score}分</span>
      </div>
      <div style={{ fontSize: 13, color: '#595959', marginTop: 4 }}>{item.reason}</div>
      <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
        日均产量：{item.avgPerDay.toFixed(0)} 件 | 对比均值：
        <span style={{ color: item.vsAvgPct >= 0 ? '#52c41a' : '#ff4d4f' }}>
          {item.vsAvgPct >= 0 ? '+' : ''}{item.vsAvgPct.toFixed(0)}%
        </span>
        {item.lastActiveDate && ` | 最后活跃：${item.lastActiveDate}`}
      </div>
    </div>
  </div>
);

const SmartAssignmentPanel: React.FC = () => {
  const [stageName, setStageName] = useState<string>('车缝');
  const [quantity, setQuantity] = useState<number | null>(null);
  const [data, setData] = useState<SmartAssignmentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    if (!stageName) return;
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.recommendAssignment({
        stageName,
        quantity: quantity ?? undefined,
      }) as any;
      const payload: SmartAssignmentResponse | null = res?.data ?? null;
      setData(payload);
    } catch (e: any) {
      setError(e?.message || '推荐失败');
    } finally {
      setLoading(false);
    }
  }, [stageName, quantity]);

  return (
    <div className="intelligence-panel">
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <Select
          value={stageName}
          onChange={setStageName}
          options={STAGE_OPTIONS}
          style={{ width: 140 }}
          placeholder="选择工序"
        />
        <InputNumber
          value={quantity}
          onChange={v => setQuantity(v)}
          placeholder="件数(可选)"
          min={1}
          style={{ width: 130 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={fetch} loading={loading}>
          智能推荐
        </Button>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>
        {data?.recommendations?.length ? (
          <>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#8c8c8c' }}>
              「{data.stageName}」工序 Top {data.recommendations.length} 推荐人选
            </div>
            {data.recommendations.map((w, idx) => (
              <WorkerCard key={w.operatorName} item={w} rank={idx + 1} />
            ))}
          </>
        ) : !loading && <Empty description="请选择工序后点击推荐" />}
      </Spin>
    </div>
  );
};

export default SmartAssignmentPanel;
