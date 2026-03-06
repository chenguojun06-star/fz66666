import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Progress, Tag, Spin, Alert } from 'antd';

interface StageProgress {
  stageName: string;
  rate: number;
  status: 'PENDING' | 'ACTIVE' | 'DONE';
}

interface ScanEntry {
  processName: string;
  quantity: number;
  scanTime: string;
}

interface AiPrediction {
  predictedFinishDate: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  riskReason: string;
}

interface ShareInfo {
  expiresAt: string;
  accessCount: number;
}

interface OrderTrackData {
  orderNo: string;
  styleName: string;
  factoryName: string;
  productionProgress: number;
  expectedShipDate: string;
  stages: StageProgress[];
  recentScans: ScanEntry[];
  aiPrediction: AiPrediction;
  shareInfo: ShareInfo;
}

const RISK_COLOR = { LOW: '#52c41a', MEDIUM: '#faad14', HIGH: '#ff4d4f' } as const;
const RISK_LABEL = { LOW: '低风险', MEDIUM: '中风险', HIGH: '高风险' } as const;
const STATUS_COLOR = { PENDING: '#d9d9d9', ACTIVE: '#1677ff', DONE: '#52c41a' } as const;

function formatDate(str: string | null | undefined): string {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return str;
  }
}

function formatTime(str: string | null | undefined): string {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return str;
  }
}

const ShareOrderPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<OrderTrackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError('无效的分享链接'); setLoading(false); return; }
    fetch(`/api/public/order-track/${token}`)
      .then(r => r.json())
      .then(res => {
        if (res.code === 200 && res.data) {
          setData(res.data);
        } else {
          setError(res.message || '链接已过期或无效');
        }
      })
      .catch(() => setError('网络连接失败，请稍后重试'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f7fa' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f7fa' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <div style={{ fontSize: 18, color: '#666', marginBottom: 8 }}>链接无效或已过期</div>
          <div style={{ fontSize: 13, color: '#999' }}>{error}</div>
        </div>
      </div>
    );
  }

  const ai = data.aiPrediction;
  const riskColor = RISK_COLOR[ai?.riskLevel] ?? '#999';

  return (
    <div style={{ background: '#f5f7fa', minHeight: '100vh', padding: '24px 0' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px' }}>

        {/* 品牌标题 */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: '#999', letterSpacing: 2, marginBottom: 4 }}>PRODUCTION TRACKING</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', letterSpacing: 0.5 }}>生产进度追踪</div>
        </div>

        <Alert
          style={{ marginBottom: 16, borderRadius: 12 }}
          type="info"
          showIcon
          message="该分享链接仅1小时内有效"
          description="页面仅展示生产进度与AI预测信息，不展示单价，不支持下载。"
        />

        {/* 订单基本信息 */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>订单编号</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', fontFamily: 'monospace' }}>{data.orderNo}</div>
            </div>
            <Tag color={riskColor} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, border: 'none' }}>
              {RISK_LABEL[ai?.riskLevel] ?? '未知'}
            </Tag>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
            <div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>款式名称</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{data.styleName || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>生产工厂</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{data.factoryName || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>预计交期</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{formatDate(data.expectedShipDate)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>总体进度</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1677ff' }}>{data.productionProgress ?? 0}%</div>
            </div>
          </div>
        </div>

        {/* 工序进度 */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 16 }}>工序进度</div>
          {data.stages?.map(s => (
            <div key={s.stageName} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[s.status] }} />
                  <span style={{ fontSize: 13, color: '#333' }}>{s.stageName}</span>
                </div>
                <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{s.rate}%</span>
              </div>
              <Progress
                percent={s.rate}
                showInfo={false}
                strokeColor={s.status === 'DONE' ? '#52c41a' : s.status === 'ACTIVE' ? '#1677ff' : '#d9d9d9'}
                trailColor="#f0f0f0"
                strokeWidth={6}
              />
            </div>
          ))}
        </div>

        {/* AI 预测 */}
        {ai && (
          <div style={{ background: `linear-gradient(135deg, ${riskColor}10, ${riskColor}05)`, border: `1px solid ${riskColor}30`, borderRadius: 16, padding: '18px 24px', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>🤖 AI 预测分析</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>预测完成日期</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{ai.predictedFinishDate || '计算中'}</div>
              </div>
              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>预测置信度</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: riskColor }}>{ai.confidence ?? 0}%</div>
              </div>
            </div>
            {ai.riskReason && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#666', background: '#fff', borderRadius: 8, padding: '8px 12px' }}>
                💡 {ai.riskReason}
              </div>
            )}
          </div>
        )}

        {/* 最近扫码记录 */}
        {data.recentScans?.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 14 }}>最近生产记录</div>
            {data.recentScans.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < data.recentScans.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                    ✓
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: '#333', fontWeight: 500 }}>{s.processName || '工序'}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>{formatTime(s.scanTime)}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1677ff' }}>×{s.quantity}</div>
              </div>
            ))}
          </div>
        )}

        {/* 底部说明 */}
        <div style={{ textAlign: 'center', padding: '16px 0 8px', color: '#bbb', fontSize: 11 }}>
          此链接由供应链系统生成 · 访问次数：{data.shareInfo?.accessCount ?? 0} 次
          {data.shareInfo?.expiresAt && (
            <span> · 失效时间 {formatTime(data.shareInfo.expiresAt)}</span>
          )}
        </div>

      </div>
    </div>
  );
};

export default ShareOrderPage;
