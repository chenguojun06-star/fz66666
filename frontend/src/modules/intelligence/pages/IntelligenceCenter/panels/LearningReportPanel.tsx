import React, { useEffect, useState, useCallback } from 'react';
import { Button, Alert, Spin, Empty, Progress, Table } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { LearningReportResponse, StageLearningStat } from '@/services/production/productionApi';

const stageColumns = [
  { title: '工序', dataIndex: 'stageName', key: 'stageName', width: 100 },
  {
    title: '样本数', dataIndex: 'sampleCount', key: 'sampleCount', width: 90,
    sorter: (a: StageLearningStat, b: StageLearningStat) => a.sampleCount - b.sampleCount,
  },
  {
    title: '置信度', dataIndex: 'confidence', key: 'confidence', width: 120,
    render: (v: number) => <Progress percent={Math.round(v * 100)} size="small" status={v >= 0.7 ? 'success' : v >= 0.4 ? 'normal' : 'exception'} />,
    sorter: (a: StageLearningStat, b: StageLearningStat) => a.confidence - b.confidence,
  },
  {
    title: '均值(分/件)', dataIndex: 'avgMinutesPerUnit', key: 'avgMinutesPerUnit', width: 110,
    render: (v: number) => v.toFixed(2),
  },
];

const LearningReportPanel: React.FC = () => {
  const [data, setData] = useState<LearningReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getLearningReport() as any;
      const payload: LearningReportResponse | null = res?.data ?? null;
      setData(payload);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="intelligence-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>AI 学习状态看板</span>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>
        {data ? (
          <>
            <div className="stat-row">
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#1677ff' }}>{data.totalSamples}</div>
                <div className="stat-label">训练样本</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{data.stageCount}</div>
                <div className="stat-label">覆盖工序</div>
              </div>
              <div className="stat-card">
                <Progress type="circle" percent={Math.round(data.avgConfidence * 100)} size={64}
                  strokeColor={data.avgConfidence >= 0.7 ? '#52c41a' : '#faad14'} />
                <div className="stat-label">平均置信度</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: '#52c41a' }}>{data.feedbackCount}</div>
                <div className="stat-label">反馈次数</div>
              </div>
            </div>
            {data.lastLearnTime && (
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 12 }}>
                最后学习时间：{data.lastLearnTime}
              </div>
            )}
            <Table
              rowKey="stageName"
              columns={stageColumns}
              dataSource={data.stages || []}
              pagination={false}
              size="small"
            />
          </>
        ) : !loading && <Empty description="暂无学习数据" />}
      </Spin>
    </div>
  );
};

export default LearningReportPanel;
