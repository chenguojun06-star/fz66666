import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Progress, Tag, Spin, Alert } from 'antd';
import OrderInfoGrid from '@/components/common/OrderInfoGrid';
import { clampProgress } from '@/modules/production/utils/calcOrderProgress';

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

interface OrderTrackData {
  orderNo: string;
  styleName: string;
  factoryName: string;
  productionProgress: number;
  plannedEndDate?: string;       // 后端字段名（原 expectedShipDate）
  styleNo?: string;
  color?: string;
  size?: string;
  orderQuantity?: number;
  completedQuantity?: number;
  statusText?: string;
  latestScanTime?: string;
  latestScanStage?: string;
  companyName?: string;
  expiresAt?: number;             // 后端返回毫秒时间戳（原 shareInfo.expiresAt）
  // 以下为扩展字段，后端暂未返回，渲染时做空值保护
  stages?: StageProgress[];
  recentScans?: ScanEntry[];
  aiPrediction?: AiPrediction;
}

const RISK_COLOR = { LOW: '#52c41a', MEDIUM: '#faad14', HIGH: '#ff4d4f' } as const;
const RISK_LABEL = { LOW: '低风险', MEDIUM: '中风险', HIGH: '高风险' } as const;
const STATUS_COLOR = { PENDING: '#d9d9d9', ACTIVE: '#1677ff', DONE: '#52c41a' } as const;

function getDaysLeft(dateText?: string): number | null {
  if (!dateText) return null;
  const ms = new Date(dateText).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil((ms - Date.now()) / 86400000);
}

function buildSmartNarrative(data: OrderTrackData) {
  const daysLeft = getDaysLeft(data.plannedEndDate);
  const latestStage = data.latestScanStage || data.statusText || '当前阶段';
  const progress = clampProgress(Number(data.productionProgress || 0));
  let summary = `${latestStage}，完成 ${progress}%`;
  let reason = '生产节奏正常。';
  let prediction = data.plannedEndDate ? `预计 ${formatDate(data.plannedEndDate)} 完成` : '暂无交期，请确认工厂反馈。';

  if (daysLeft != null && daysLeft < 0) {
    summary = `${latestStage}，已逾期 ${Math.abs(daysLeft)} 天`;
    reason = data.latestScanTime
      ? `最近推进：${formatTime(data.latestScanTime)}，请确认卡点。`
      : '无近期推进记录，请核查工厂状态。';
    prediction = '高风险，建议立即催办。';
  } else if (daysLeft != null && daysLeft <= 3 && progress < 80) {
    summary = `距交期 ${daysLeft} 天，${latestStage}，进度 ${progress}%`;
    reason = '交期临近，进度偏慢。';
    prediction = data.plannedEndDate ? `加速推进仍可在 ${formatDate(data.plannedEndDate)} 前完成` : prediction;
  } else if (progress >= 95) {
    summary = `${latestStage}收尾中，${progress}%`;
    reason = '剩余尾部/质检/入库，风险低。';
    prediction = data.plannedEndDate ? `预计 ${formatDate(data.plannedEndDate)} 前收尾` : '预计很快完成。';
  } else if (data.latestScanTime) {
    reason = `最近推进：${formatTime(data.latestScanTime)}`;
  }

  return { summary, reason, prediction };
}

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
    fetch(`/api/public/share/order/${token}`)
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
        <Spin size="large" spinning tip="加载中..."><div /></Spin>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f7fa' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}></div>
          <div style={{ fontSize: 18, color: '#666', marginBottom: 8 }}>链接无效或已过期</div>
          <div style={{ fontSize: 13, color: '#999' }}>{error}</div>
        </div>
      </div>
    );
  }

  const ai = data.aiPrediction;
  const riskColor = RISK_COLOR[ai?.riskLevel ?? ''] ?? '#999';
  const smartNarrative = buildSmartNarrative(data);
  const daysLeft = getDaysLeft(data.plannedEndDate);
  const pageRiskTone = daysLeft != null && daysLeft < 0
    ? { label: '已逾期', color: '#ff4136' }
    : ai?.riskLevel
      ? { label: RISK_LABEL[ai.riskLevel], color: RISK_COLOR[ai.riskLevel] }
      : { label: '跟踪中', color: '#00e5ff' };
  const shareInfoLabelStyle: React.CSSProperties = { color: '#79a8c7', fontSize: 11 };
  const shareInfoValueStyle: React.CSSProperties = { color: '#dff3ff', fontSize: 13, fontWeight: 600 };

  return (
    <div style={{
      minHeight: '100vh',
      padding: '24px 0',
      background:
        'radial-gradient(circle at top left, rgba(0,229,255,0.10), transparent 28%), radial-gradient(circle at bottom right, rgba(57,255,20,0.08), transparent 22%), linear-gradient(180deg, #08101d 0%, #0b1424 100%)',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px' }}>

        {/* 品牌标题 */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: '#76a7c4', letterSpacing: 2, marginBottom: 4 }}>PRODUCTION TRACKING</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e6f7ff', letterSpacing: 0.5, textShadow: '0 0 18px rgba(0,229,255,0.25)' }}>工序跟进追踪</div>
        </div>

        <Alert
          style={{ marginBottom: 16, borderRadius: 12, background: 'rgba(8,20,40,0.72)', borderColor: 'rgba(0,229,255,0.16)', color: '#d8f1ff' }}
          type="info"
          showIcon
          title="该分享链接1天内有效"
          description="页面仅展示工序跟进信息，不展示单价，不支持下载。"
        />

        {/* 订单基本信息 */}
        <div style={{ background: 'rgba(8,20,40,0.78)', borderRadius: 16, padding: '20px 24px', marginBottom: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', border: '1px solid rgba(0,229,255,0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: '#79a8c7', marginBottom: 2 }}>订单编号</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f2fbff', fontFamily: 'monospace' }}>{data.orderNo}</div>
            </div>
            <Tag color={pageRiskTone.color} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, border: 'none', color: '#fff', boxShadow: `0 0 18px ${pageRiskTone.color}33` }}>
              {pageRiskTone.label}
            </Tag>
          </div>
          <OrderInfoGrid
            gap={12}
            rowGap={8}
            fontSize={13}
            items={[
              { label: '款式名称', value: data.styleName || '—', labelStyle: shareInfoLabelStyle, valueStyle: shareInfoValueStyle },
              { label: '款号', value: data.styleNo || '—', labelStyle: shareInfoLabelStyle, valueStyle: shareInfoValueStyle },
              { label: '生产工厂', value: data.factoryName || '—', labelStyle: shareInfoLabelStyle, valueStyle: shareInfoValueStyle },
              { label: '颜色', value: data.color || '—', labelStyle: shareInfoLabelStyle, valueStyle: shareInfoValueStyle },
              { label: '码数', value: data.size || '—', labelStyle: shareInfoLabelStyle, valueStyle: shareInfoValueStyle },
              { label: '下单数量', value: data.orderQuantity != null ? `${data.orderQuantity}` : '—', labelStyle: shareInfoLabelStyle, valueStyle: shareInfoValueStyle },
              { label: '完成数量', value: data.completedQuantity != null ? `${data.completedQuantity}` : '—', labelStyle: shareInfoLabelStyle, valueStyle: shareInfoValueStyle },
              { label: '预计交期', value: formatDate(data.plannedEndDate), labelStyle: shareInfoLabelStyle, valueStyle: shareInfoValueStyle },
              {
                label: '总体进度',
                value: <span style={{ color: '#00e5ff', fontWeight: 700 }}>{clampProgress(data.productionProgress ?? 0)}%</span>,
                labelStyle: shareInfoLabelStyle,
                valueStyle: shareInfoValueStyle,
              },
            ]}
          />
        </div>

        <div style={{ background: 'rgba(8,20,40,0.78)', borderRadius: 16, padding: '18px 24px', marginBottom: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', border: '1px solid rgba(57,255,20,0.14)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e6f7ff', marginBottom: 12 }}> 智能进度说明</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ borderRadius: 12, background: 'rgba(255,255,255,0.04)', padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#7fa7c2', marginBottom: 4 }}>当前状态</div>
              <div style={{ fontSize: 13, color: '#dff5ff', lineHeight: 1.7 }}>{smartNarrative.summary}</div>
            </div>
            <div style={{ borderRadius: 12, background: 'rgba(255,255,255,0.04)', padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#7fa7c2', marginBottom: 4 }}>当前判断</div>
              <div style={{ fontSize: 13, color: '#dff5ff', lineHeight: 1.7 }}>{smartNarrative.reason}</div>
            </div>
            <div style={{ borderRadius: 12, background: 'rgba(255,255,255,0.04)', padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#7fa7c2', marginBottom: 4 }}>预计说明</div>
              <div style={{ fontSize: 13, color: '#dff5ff', lineHeight: 1.7 }}>{smartNarrative.prediction}</div>
            </div>
          </div>
        </div>

        {/* 工序进度 */}
        <div style={{ background: 'rgba(8,20,40,0.78)', borderRadius: 16, padding: '20px 24px', marginBottom: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', border: '1px solid rgba(0,229,255,0.12)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e6f7ff', marginBottom: 16 }}>工序进度</div>
          {data.stages?.map(s => (
            <div key={s.stageName} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[s.status] }} />
                  <span style={{ fontSize: 13, color: '#dff5ff' }}>{s.stageName}</span>
                </div>
                <span style={{ fontSize: 12, color: '#8cccf2', fontWeight: 600 }}>{s.rate}%</span>
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
          <div style={{ background: `linear-gradient(135deg, rgba(8,20,40,0.88), rgba(8,20,40,0.76))`, border: `1px solid ${riskColor}30`, borderRadius: 16, padding: '18px 24px', marginBottom: 16, boxShadow: `0 8px 24px ${riskColor}14` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e6f7ff', marginBottom: 12 }}> AI 预测分析</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#7fa7c2', marginBottom: 4 }}>预测完成日期</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e6f7ff' }}>{ai.predictedFinishDate || '计算中'}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#7fa7c2', marginBottom: 4 }}>预测置信度</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: riskColor }}>{ai.confidence ?? 0}%</div>
              </div>
            </div>
            {ai.riskReason && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#d7efff', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px' }}>
                 {ai.riskReason}
              </div>
            )}
          </div>
        )}

        {/* 最近扫码记录 */}
        {data.recentScans && data.recentScans.length > 0 && (
          <div style={{ background: 'rgba(8,20,40,0.78)', borderRadius: 16, padding: '20px 24px', marginBottom: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', border: '1px solid rgba(0,229,255,0.12)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e6f7ff', marginBottom: 14 }}>最近生产记录</div>
            {data.recentScans.map((s: ScanEntry, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < data.recentScans!.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(57,255,20,0.14)', color: '#39ff14', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>

                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: '#dff5ff', fontWeight: 500 }}>{s.processName || '工序'}</div>
                    <div style={{ fontSize: 11, color: '#7fa7c2' }}>{formatTime(s.scanTime as string | null | undefined)}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#00e5ff' }}>×{s.quantity as React.ReactNode}</div>
              </div>
            ))}
          </div>
        )}

        {/* 底部说明 */}
        <div style={{ textAlign: 'center', padding: '16px 0 8px', color: '#7fa7c2', fontSize: 11 }}>
          此链接由供应链系统生成
          {data.expiresAt && (
            <span> · 失效时间 {formatTime(new Date(data.expiresAt).toISOString())}</span>
          )}
        </div>

      </div>
    </div>
  );
};

export default ShareOrderPage;
