import React, { useEffect, useState, useCallback } from 'react';
import { Button, Alert, Spin, Empty, Badge } from 'antd';
import { ReloadOutlined, WarningOutlined, InfoCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { AnomalyDetectionResponse, AnomalyItem } from '@/services/production/productionApi';

const typeLabel: Record<string, string> = {
  output_spike: '产量异常',
  quality_spike: '质量异常',
  idle_worker: '人员闲置',
  night_scan: '夜间扫码',
};

const severityIcon: Record<string, React.ReactNode> = {
  critical: <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />,
  warning: <WarningOutlined style={{ color: '#faad14', fontSize: 18 }} />,
  info: <InfoCircleOutlined style={{ color: '#1677ff', fontSize: 18 }} />,
};

const AnomalyCard: React.FC<{ item: AnomalyItem }> = ({ item }) => (
  <div className={`anomaly-card ${item.severity}`}>
    <div>{severityIcon[item.severity]}</div>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 600 }}>
        <Badge color={item.severity === 'critical' ? 'red' : item.severity === 'warning' ? 'orange' : 'blue'} />
        {item.title}
        <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>{typeLabel[item.type] || item.type}</span>
      </div>
      <div style={{ fontSize: 13, color: '#595959', marginTop: 4 }}>{item.description}</div>
      {item.deviationRatio > 0 && (
        <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
          偏差倍数：{item.deviationRatio.toFixed(1)}x | 今日：{item.todayValue} | 历史均值：{item.historyAvg.toFixed(1)}
        </div>
      )}
    </div>
  </div>
);

const AnomalyPanel: React.FC = () => {
  const [data, setData] = useState<AnomalyDetectionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.detectAnomalies() as any;
      const payload: AnomalyDetectionResponse | null = res?.data ?? null;
      setData(payload);
    } catch (e: any) {
      setError(e?.message || '检测失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const criticalCount = data?.items?.filter(i => i.severity === 'critical').length ?? 0;
  const warningCount = data?.items?.filter(i => i.severity === 'warning').length ?? 0;

  return (
    <div className="intelligence-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          {criticalCount > 0 && (
            <Alert type="error" message={`发现 ${criticalCount} 项严重异常需立即处理`} showIcon />
          )}
          {criticalCount === 0 && warningCount > 0 && (
            <Alert type="warning" message={`发现 ${warningCount} 项警告`} showIcon />
          )}
          {criticalCount === 0 && warningCount === 0 && data && (
            <Alert type="success" message="当前无异常行为，运营正常" showIcon />
          )}
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>
        {data?.items?.length ? (
          data.items.map((item, idx) => <AnomalyCard key={idx} item={item} />)
        ) : !loading && <Empty description="暂无异常" />}
      </Spin>
      {data && (
        <div style={{ textAlign: 'right', marginTop: 12, fontSize: 12, color: '#8c8c8c' }}>
          共扫描 {data.totalChecked} 项指标
        </div>
      )}
    </div>
  );
};

export default AnomalyPanel;
