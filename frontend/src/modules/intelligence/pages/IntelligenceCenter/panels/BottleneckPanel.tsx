import React, { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Button, Alert, Empty, Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { BottleneckDetectionResponse, BottleneckItem } from '@/services/production/productionApi';

const severityMap = {
  critical: { color: 'red', text: '严重堵塞' },
  warning: { color: 'orange', text: '轻度积压' },
  normal: { color: 'green', text: '正常' },
};

const columns = [
  { title: '工序', dataIndex: 'stageName', key: 'stageName', width: 100 },
  {
    title: '上游完成', dataIndex: 'upstreamDone', key: 'upstreamDone', width: 100,
    render: (v: number) => `${v} 件`,
  },
  {
    title: '本工序完成', dataIndex: 'currentDone', key: 'currentDone', width: 110,
    render: (v: number) => `${v} 件`,
  },
  {
    title: '积压量', dataIndex: 'backlog', key: 'backlog', width: 90,
    render: (v: number) => <span style={{ fontWeight: v > 0 ? 700 : 400 }}>{v} 件</span>,
  },
  {
    title: '严重程度', dataIndex: 'severity', key: 'severity', width: 100,
    render: (s: BottleneckItem['severity']) => {
      const m = severityMap[s] || severityMap.normal;
      return <Tag color={m.color}>{m.text}</Tag>;
    },
  },
  { title: '建议', dataIndex: 'suggestion', key: 'suggestion', ellipsis: true },
];

const BottleneckPanel: React.FC = () => {
  const [data, setData] = useState<BottleneckDetectionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.detectBottleneck() as any;
      const payload: BottleneckDetectionResponse | null = res?.data ?? null;
      setData(payload);
    } catch (e: any) {
      setError(e?.message || '检测失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="intelligence-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          {data?.hasBottleneck && (
            <Alert type="warning" message={data.summary} showIcon style={{ marginBottom: 0 }} />
          )}
          {data && !data.hasBottleneck && (
            <Alert type="success" message="当前无工序瓶颈，生产流畅" showIcon />
          )}
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>
        {data?.items?.length ? (
          <Table
            rowKey="stageName"
            columns={columns}
            dataSource={data.items.filter(i => i.severity !== 'normal')}
            pagination={false}
            size="small"
          />
        ) : !loading && <Empty description="暂无数据" />}
      </Spin>
    </div>
  );
};

export default BottleneckPanel;
