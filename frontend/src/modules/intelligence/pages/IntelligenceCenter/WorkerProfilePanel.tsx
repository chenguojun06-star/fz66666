import React, { useState, useCallback } from 'react';
import { Input, Button, Tag } from 'antd';
import { UserOutlined, SearchOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';

type StageProfile = {
  stageName: string;
  avgPerDay: number;
  totalQty: number;
  activeDays: number;
  vsFactoryAvgPct: number;
  level: string;
};

type ProfileData = {
  operatorName?: string;
  stages?: StageProfile[];
  totalQty?: number;
  lastScanTime?: string | null;
  dateDays?: number;
};

const levelColor: Record<string, string> = {
  excellent: '#39ff14',
  good: '#00e5ff',
  normal: '#f7a600',
  below: '#ff4136',
};
const levelLabel: Record<string, string> = {
  excellent: '优秀',
  good: '良好',
  normal: '一般',
  below: '待提升',
};

/** 工人效率画像面板 */
const WorkerProfilePanel: React.FC = () => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState('');

  const handleSearch = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.workerProfile({ operatorName: trimmed }) as any;
      const d: ProfileData = res?.data ?? res;
      setData(d);
      if (!d?.stages?.length) setError('该工人暂无扫码记录（已自动扩展至 90 天）');
    } catch {
      setError('查询失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [name]);

  const stages = data?.stages ?? [];

  return (
    <div className="c-card">
      <div className="c-card-title">
        <UserOutlined style={{ marginRight: 6, color: '#00e5ff' }} />
        工人效率画像
        <span className="c-card-badge cyan-badge">30 天周期分析</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4a6d8a' }}>
          输入工人姓名 → 查看各工序日均产量与工厂对比
        </span>
      </div>

      {/* 搜索栏 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#4a6d8a' }} />}
          placeholder="输入工人姓名，如：张三"
          value={name}
          onChange={e => setName(e.target.value)}
          onPressEnter={handleSearch}
          style={{
            flex: 1, maxWidth: 280,
            background: 'rgba(0,229,255,0.05)',
            border: '1px solid rgba(0,229,255,0.2)',
            color: '#e2f0ff',
          }}
        />
        <Button
          type="primary"
          loading={loading}
          onClick={handleSearch}
          icon={<SearchOutlined />}
          style={{ background: 'rgba(0,229,255,0.15)', borderColor: 'rgba(0,229,255,0.4)', color: '#00e5ff' }}
        >
          查询
        </Button>
      </div>

      {/* 摘要信息 */}
      {data && data.operatorName && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ color: '#4a6d8a', fontSize: 12 }}>
            工人：<b style={{ color: '#e2f0ff' }}>{data.operatorName}</b>
          </span>
          <span style={{ color: '#4a6d8a', fontSize: 12 }}>
            统计周期：<b style={{ color: '#e2f0ff' }}>{data.dateDays ?? 30} 天</b>
          </span>
          <span style={{ color: '#4a6d8a', fontSize: 12 }}>
            累计产量：<b style={{ color: '#00e5ff' }}>{(data.totalQty ?? 0).toLocaleString()} 件</b>
          </span>
          {data.lastScanTime && (
            <span style={{ color: '#4a6d8a', fontSize: 12 }}>
              最近扫码：<b style={{ color: '#e2f0ff' }}>{data.lastScanTime.slice(0, 10)}</b>
            </span>
          )}
        </div>
      )}

      {/* 错误/空状态 */}
      {error && <div className="c-empty" style={{ color: '#f7a600' }}>{error}</div>}
      {!data && !loading && !error && (
        <div className="c-empty">输入工人姓名后点击查询，查看其效率画像</div>
      )}

      {/* 工序能力条形图 */}
      {stages.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="c-table">
            <thead>
              <tr>
                <th>工序</th>
                <th>日均产量</th>
                <th>效率对比</th>
                <th>活跃天</th>
                <th>总产量</th>
                <th>评级</th>
              </tr>
            </thead>
            <tbody>
              {stages.map(s => {
                const barWidth = Math.min(100, Math.max(10, ((s.vsFactoryAvgPct ?? 0) + 100) / 2));
                const col = levelColor[s.level] ?? '#888';
                return (
                  <tr key={s.stageName}>
                    <td style={{ color: '#e2f0ff', fontWeight: 600 }}>{s.stageName}</td>
                    <td style={{ color: '#00e5ff', fontWeight: 600 }}>{s.avgPerDay} 件/天</td>
                    <td style={{ minWidth: 140 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          flex: 1, height: 6, background: 'rgba(255,255,255,0.07)',
                          borderRadius: 3, overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${barWidth}%`, height: '100%',
                            background: col, borderRadius: 3,
                            transition: 'width 0.6s ease',
                          }} />
                        </div>
                        <span style={{
                          fontSize: 11, minWidth: 56, textAlign: 'right',
                          color: (s.vsFactoryAvgPct ?? 0) >= 0 ? '#39ff14' : '#ff4136',
                        }}>
                          {(s.vsFactoryAvgPct ?? 0) >= 0 ? '+' : ''}{s.vsFactoryAvgPct}%
                        </span>
                      </div>
                    </td>
                    <td style={{ color: '#4a6d8a' }}>{s.activeDays} 天</td>
                    <td style={{ color: '#a0c4e0' }}>{s.totalQty.toLocaleString()}</td>
                    <td>
                      <Tag style={{
                        background: `${col}22`, color: col, borderColor: col,
                        fontSize: 11,
                      }}>
                        {levelLabel[s.level] ?? s.level}
                      </Tag>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default WorkerProfilePanel;
