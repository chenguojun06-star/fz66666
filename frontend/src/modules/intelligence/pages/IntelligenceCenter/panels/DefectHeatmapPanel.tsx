import React, { useState, useEffect, useCallback } from 'react';
import { Spin, Alert, Tag, Statistic, Row, Col, Tooltip } from 'antd';
import { FireOutlined, WarningOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { DefectHeatmapResponse, HeatCell } from '@/services/production/productionApi';

const intensityColor = (v: number): string => {
  if (v >= 0.8) return '#ff4d4f';
  if (v >= 0.6) return '#ff7a45';
  if (v >= 0.4) return '#ffa940';
  if (v >= 0.2) return '#ffd666';
  if (v > 0)    return '#ffe58f';
  return '#f6ffed';
};

const DefectHeatmapPanel: React.FC = () => {
  const [data, setData] = useState<DefectHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getDefectHeatmap() as any;
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) return <Spin style={{ display: 'block', padding: 60, textAlign: 'center' }} />;
  if (error) return <Alert type="error" message={error} showIcon />;
  if (!data) return null;

  // 提取行列
  const processes = [...new Set(data.cells.map(c => c.process))];
  const factories = [...new Set(data.cells.map(c => c.factory))];
  const cellMap = new Map<string, HeatCell>();
  data.cells.forEach(c => cellMap.set(`${c.process}__${c.factory}`, c));

  return (
    <div className="intelligence-panel heatmap-panel">
      {/* 统计摘要 */}
      <Row gutter={24} style={{ marginBottom: 20 }}>
        <Col span={8}>
          <Statistic
            title="总缺陷数"
            value={data.totalDefects}
            prefix={<FireOutlined style={{ color: '#f5222d' }} />}
          />
        </Col>
        <Col span={8}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>最差工序</div>
          <Tag color="red" style={{ fontSize: 14 }}>{data.worstProcess || '-'}</Tag>
        </Col>
        <Col span={8}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>最差工厂</div>
          <Tag color="volcano" style={{ fontSize: 14 }}>{data.worstFactory || '-'}</Tag>
        </Col>
      </Row>

      {/* 热力矩阵 */}
      <div className="heatmap-grid-wrapper">
        <table className="heatmap-table">
          <thead>
            <tr>
              <th className="heatmap-corner">工序＼工厂</th>
              {factories.map(f => (
                <th key={f} className="heatmap-col-header">
                  {f === data.worstFactory ? <WarningOutlined style={{ color: '#f5222d', marginRight: 4 }} /> : null}
                  {f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processes.map(p => (
              <tr key={p}>
                <td className="heatmap-row-header">
                  {p === data.worstProcess ? <WarningOutlined style={{ color: '#f5222d', marginRight: 4 }} /> : null}
                  {p}
                </td>
                {factories.map(f => {
                  const cell = cellMap.get(`${p}__${f}`);
                  const intensity = cell?.intensity ?? 0;
                  const count = cell?.defectCount ?? 0;
                  return (
                    <td key={f} className="heatmap-cell">
                      <Tooltip title={`${p} @ ${f}：${count} 次缺陷，强度 ${(intensity * 100).toFixed(0)}%`}>
                        <div
                          className="heatmap-cell-inner"
                          style={{ background: intensityColor(intensity) }}
                        >
                          {count > 0 ? count : ''}
                        </div>
                      </Tooltip>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 色阶图例 */}
      <div className="heatmap-legend">
        <span>低</span>
        {[0, 0.2, 0.4, 0.6, 0.8].map(v => (
          <div key={v} className="heatmap-legend-cell" style={{ background: intensityColor(v + 0.1) }} />
        ))}
        <span>高</span>
      </div>
    </div>
  );
};

export default DefectHeatmapPanel;
