import React, { useEffect, useState, useCallback } from 'react';
import { Button, Alert, Spin, Empty, Tag, Progress, Table } from 'antd';
import { ReloadOutlined, SafetyCertificateOutlined, CheckCircleFilled, CloseCircleFilled, ToolFilled } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { SelfHealingResponse, DiagnosisItem } from '@/services/production/productionApi';

const statusIcon: Record<string, React.ReactNode> = {
  pass: <CheckCircleFilled style={{ color: '#52c41a', fontSize: 16 }} />,
  fail: <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 16 }} />,
  fixed: <ToolFilled style={{ color: '#1677ff', fontSize: 16 }} />,
  manual: <CloseCircleFilled style={{ color: '#faad14', fontSize: 16 }} />,
};

const statusTag: Record<string, { color: string; text: string }> = {
  pass: { color: 'green', text: '通过' },
  fail: { color: 'red', text: '异常' },
  fixed: { color: 'blue', text: '已修复' },
  manual: { color: 'orange', text: '需人工' },
};

const columns = [
  {
    title: '状态', dataIndex: 'status', key: 'status', width: 60,
    render: (s: string) => statusIcon[s] || s,
  },
  { title: '检查项', dataIndex: 'checkName', key: 'checkName', width: 160 },
  {
    title: '结果', dataIndex: 'status', key: 'tag', width: 80,
    render: (s: string) => <Tag color={statusTag[s]?.color}>{statusTag[s]?.text ?? s}</Tag>,
  },
  { title: '详情', dataIndex: 'detail', key: 'detail', ellipsis: true },
  {
    title: '自愈', dataIndex: 'autoFixed', key: 'autoFixed', width: 60,
    render: (v: boolean) => v ? <Tag color="blue">已修</Tag> : null,
  },
];

const SelfHealingPanel: React.FC = () => {
  const [data, setData] = useState<SelfHealingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.runSelfHealing() as any;
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.message || '诊断失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const scoreColor = (data?.healthScore ?? 0) >= 80 ? '#52c41a' : (data?.healthScore ?? 0) >= 50 ? '#faad14' : '#ff4d4f';

  return (
    <div className="intelligence-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 600 }}>
          <SafetyCertificateOutlined style={{ color: '#1677ff', marginRight: 6 }} />
          智能异常自愈
        </span>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>重新诊断</Button>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>
        {data ? (
          <>
            <div className="healing-overview">
              <div className="healing-score">
                <Progress type="circle" percent={data.healthScore} strokeColor={scoreColor} size={100}
                  format={p => <span style={{ fontSize: 24, fontWeight: 700 }}>{p}</span>} />
                <div className="healing-status">
                  <Tag color={data.status === 'healthy' ? 'green' : data.status === 'degraded' ? 'orange' : 'red'}>
                    {data.status === 'healthy' ? '健康' : data.status === 'degraded' ? '亚健康' : '异常'}
                  </Tag>
                </div>
              </div>
              <div className="healing-counters">
                <div className="hc-item"><span className="hc-num">{data.totalChecks}</span><span className="hc-label">检查项</span></div>
                <div className="hc-item"><span className="hc-num" style={{ color: '#ff4d4f' }}>{data.issuesFound}</span><span className="hc-label">发现问题</span></div>
                <div className="hc-item"><span className="hc-num" style={{ color: '#1677ff' }}>{data.autoFixed}</span><span className="hc-label">自动修复</span></div>
                <div className="hc-item"><span className="hc-num" style={{ color: '#faad14' }}>{data.needManual}</span><span className="hc-label">需人工</span></div>
              </div>
            </div>
            <Table
              rowKey="checkName"
              columns={columns}
              dataSource={data.items}
              pagination={false}
              size="small"
            />
          </>
        ) : !loading && <Empty description="点击诊断开始检测" />}
      </Spin>
    </div>
  );
};

export default SelfHealingPanel;
