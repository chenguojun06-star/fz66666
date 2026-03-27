import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Progress, Spin, Result as AntResult, Tag } from 'antd';
import {
  ClockCircleFilled,
  ClockCircleOutlined,
  CalendarOutlined,
  TeamOutlined,
  MessageOutlined,
  FieldTimeOutlined,
  DeploymentUnitOutlined,
  InboxOutlined,
  ScissorOutlined,
  SkinOutlined,
  AuditOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { CuteCloudTrigger } from '@/components/common/XiaoyunCloudAvatar';
import OrderInfoGrid from '@/components/common/OrderInfoGrid';
import { createOrderColorSizeMatrixInfoItems } from '@/components/common/OrderColorSizeMatrix';

type StageStatus = 'DONE' | 'ACTIVE' | 'PENDING';
const PLATFORM_URL = 'https://www.webyszl.cn';

interface ShareOrderData {
  orderNo: string;
  styleNo: string;
  styleName?: string;
  styleCover?: string;
  color?: string;
  size?: string;
  orderQuantity: number;
  completedQuantity?: number;
  productionProgress?: number;
  statusText: string;
  plannedEndDate?: string;
  actualEndDate?: string;
  createTime?: string;
  latestScanTime?: string;
  latestScanStage?: string;
  factoryName?: string;
  companyName?: string;
  expiresAt?: number;
  remarks?: string;
  currentStage?: string;
  sizeQuantities?: Array<{
    size: string;
    quantity?: number;
  }>;
  colorSizeQuantities?: Array<{
    color?: string;
    size?: string;
    quantity?: number;
  }>;
  stages?: Array<{
    stageName: string;
    rate: number;
    status: StageStatus;
  }>;
  recentScans?: Array<{
    processName?: string;
    quantity?: number;
    scanTime?: string;
  }>;
  aiPrediction?: {
    predictedFinishDate?: string;
    estimatedRemainingDays?: number;
    confidence?: number;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    riskReason?: string;
  };
}

const statusColorMap: Record<string, string> = {
  '待开始': 'default',
  '生产中': 'processing',
  '已完成': 'success',
  '延期中': 'error',
  '已关单': 'default',
};

const stageIconMap: Record<string, React.ReactNode> = {
  '采购备料': <InboxOutlined />,
  '裁剪': <ScissorOutlined />,
  '车缝': <SkinOutlined />,
  '质检': <AuditOutlined />,
  '入库': <DeploymentUnitOutlined />,
  '包装': <InboxOutlined />,
};

const ShareOrderPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ShareOrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('链接无效');
      setLoading(false);
      return;
    }
    // 分享页是公开接口，使用不带 auth 头的裸 axios，避免过期 token 触发后端 400
    axios
      .get<{ code: number; data: ShareOrderData; message: string }>(
        `/api/public/share/order/${encodeURIComponent(token)}`
      )
      .then((res) => {
        const d = (res as any)?.data ?? res;
        if (d?.code !== undefined && d.code !== 200) {
          setError(d.message || '分享链接已失效');
        } else {
          setData((d?.data ?? d) as ShareOrderData);
        }
      })
      .catch(() => setError('网络错误，请稍后重试'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={pageStyle}>
        <Spin size="large" spinning tip="加载中…"><div /></Spin>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={pageStyle}>
        <AntResult
          status="warning"
          title={error || '订单信息不存在'}
          subTitle="此分享链接可能已过期或不存在，请联系发送方重新分享"
        />
      </div>
    );
  }

  const progress = Math.min(100, Math.max(0, data.productionProgress ?? 0));
  const statusColor = statusColorMap[data.statusText] ?? 'processing';
  const aiPrediction = data.aiPrediction;
  const stages = data.stages ?? [];
  const currentStage = data.currentStage || data.latestScanStage || '生产中';
  const recentScans = data.recentScans ?? [];
  const riskTone = getRiskTone(aiPrediction?.riskLevel);
  const plannedDateText = formatDate(data.plannedEndDate);
  const predictedDateText = formatDate(aiPrediction?.predictedFinishDate);
  const expiresAtText = formatDateTime(data.expiresAt);
  const remainingDaysText = formatRemainingDays(aiPrediction?.estimatedRemainingDays);
  const deliveryDiffText = describeDelivery(data.plannedEndDate, aiPrediction?.predictedFinishDate);
  const summaryText = progress >= 100
    ? '订单已完成，可关注后续发货安排。'
    : aiPrediction?.riskLevel === 'HIGH'
    ? '当前存在较高交付风险，建议重点跟进关键节点。'
    : aiPrediction?.riskLevel === 'MEDIUM'
    ? '当前节奏可控，但交期较近，需要持续跟进。'
    : '当前生产节奏正常，系统将持续跟踪关键工序。';
  const progressBarSize: [string | number, number] = ['100%', 12];
  const colorSizeQuantities = getDisplayColorSizeQuantities(data.color, data.size, data.orderQuantity, data.colorSizeQuantities);
  const styleCoverUrl = token && data.styleCover ? `/api/public/share/order/${token}/style-cover` : '';
  const totalQuantityText = `${data.orderQuantity ?? 0} 件`;
  const completedSummaryText = `已完成 ${data.completedQuantity ?? 0} / ${data.orderQuantity ?? 0} 件`;
  const displayColorText = Array.from(new Set(
    colorSizeQuantities.map((item) => String(item.color || '').trim()).filter(Boolean),
  )).join(' / ') || (String(data.color || '').trim() || '—');
  const infoLabelStyle: React.CSSProperties = { color: '#64748b', fontSize: 12 };
  const infoValueStyle: React.CSSProperties = { color: '#0f172a', fontSize: 13, fontWeight: 700 };
  const shareMatrixItems = createOrderColorSizeMatrixInfoItems({
    items: colorSizeQuantities.map((item) => ({
      color: String(item.color || '').trim(),
      size: String(item.size || '').trim(),
      quantity: Number(item.quantity ?? 0),
    })),
    fallbackColor: displayColorText,
    fallbackSize: String(data.size || '').trim(),
    fallbackQuantity: data.orderQuantity ?? 0,
    totalLabel: '总数',
    totalSuffix: '件',
    columnMinWidth: 28,
    gap: 10,
    fontSize: 13,
    labelStyle: infoLabelStyle,
    valueStyle: infoValueStyle,
  });

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <div style={heroCardStyle}>
          <div style={heroHeaderStyle}>
            <div>
              <div style={brandTitleStyle}>{data.companyName || '客户订单追踪'}</div>
              <div style={brandSubtitleStyle}>客户订单生产进度</div>
            </div>
            <Tag color={statusColor} style={statusTagStyle}>
              {data.statusText}
            </Tag>
          </div>

          <div style={heroOverviewStyle}>
            <div style={styleCoverCardStyle}>
              {styleCoverUrl ? (
                <img src={styleCoverUrl} alt={data.styleName || data.styleNo || data.orderNo} style={styleCoverImageStyle} />
              ) : (
                <div style={styleCoverPlaceholderStyle}>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>暂无款式图</div>
                </div>
              )}
            </div>

            <div>
              <div style={orderNoStyle}>{data.orderNo}</div>
              <OrderInfoGrid
                gap={10}
                rowGap={6}
                fontSize={13}
                items={[
                  { label: '款号', value: data.styleNo || '—', labelStyle: infoLabelStyle, valueStyle: infoValueStyle },
                  { label: '款名', value: data.styleName || '—', labelStyle: infoLabelStyle, valueStyle: infoValueStyle },
                  { label: '工厂', value: data.factoryName || '待分配', labelStyle: infoLabelStyle, valueStyle: infoValueStyle },
                  { label: '颜色', value: displayColorText, labelStyle: infoLabelStyle, valueStyle: infoValueStyle },
                  { label: '下单数量', value: totalQuantityText, labelStyle: infoLabelStyle, valueStyle: infoValueStyle },
                ]}
              />
            </div>
          </div>

          <div style={heroGridStyle}>
            <div style={{ ...summaryPanelStyle, minHeight: 96 }}>
              <div style={summaryCaptionStyle}>当前节点</div>
              <div style={currentStageStyle}>{currentStage}</div>
              <div style={summaryTextStyle}>{summaryText}</div>
            </div>
            <div style={{ ...summaryPanelStyle, paddingBottom: 14, minHeight: 96 }}>
              <div style={summaryCaptionStyle}>尺码数量</div>
              <OrderInfoGrid
                gap={10}
                rowGap={6}
                fontSize={13}
                items={shareMatrixItems}
              />
              <div style={sizeQtyFooterStyle}>
                <span>总数 {totalQuantityText}</span>
                <span>{completedSummaryText}</span>
              </div>
            </div>
          </div>

          <div style={progressSummaryRowStyle}>
            <div style={progressSummaryTitleStyle}>总进度 {progress}%</div>
            <div style={progressSummaryMetaStyle}>{completedSummaryText}</div>
          </div>
          <Progress
            percent={progress}
            strokeColor={{ '0%': '#3b82f6', '50%': '#10b981', '100%': '#22c55e' }}
            trailColor="rgba(148, 163, 184, 0.18)"
            size={progressBarSize}
            showInfo={false}
          />

          <div style={metricGridStyle}>
            <MetricCard icon={<CalendarOutlined />} label="计划交期" value={plannedDateText} />
            <MetricCard icon={<FieldTimeOutlined />} label="预计完成" value={predictedDateText} highlightColor={riskTone.color} />
            <MetricCard icon={<ClockCircleFilled />} label="预计还需" value={remainingDaysText} highlightColor={riskTone.color} />
            <MetricCard icon={<TeamOutlined />} label="生产工厂" value={data.factoryName || '待分配'} />
            <MetricCard icon={<CalendarOutlined />} label="下单日期" value={formatDate(data.createTime)} />
            <MetricCard icon={<ClockCircleOutlined />} label="最近更新" value={data.latestScanTime ? `${data.latestScanStage || '生产中'} · ${formatDateTime(data.latestScanTime)}` : '暂无更新'} />
          </div>
        </div>

        <div style={contentGridStyle}>
          <div style={mainColumnStyle}>
            <div style={panelStyle}>
              <div style={panelTitleStyle}>AI 智能进度卡</div>
              <div style={aiHeaderStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <XiaoyunMascotLink riskTone={riskTone} />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{riskTone.label}</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>{deliveryDiffText}</div>
                    <div style={aiSupportTextStyle}>数据由 云裳智链 · 实时智能化平台提供支持</div>
                  </div>
                </div>
                <div style={confidenceStyle}>{aiPrediction?.confidence ?? 0}% 置信度</div>
              </div>
              <div style={aiGridStyle}>
                <AiItem label="当前判断" value={aiPrediction?.riskReason || '系统正在持续分析订单进度。'} />
                <AiItem label="预计完成时间" value={`${predictedDateText} · ${remainingDaysText}`} />
              </div>
            </div>

            <div style={panelStyle}>
              <div style={panelTitleStyle}>节点进度</div>
              <div style={stageGridStyle}>
                {stages.length > 0 ? stages.map((stage) => {
                  const tone = getStageTone(stage.status);
                  const active = isCurrentStage(stage.stageName, currentStage, data.latestScanStage);
                  return (
                    <div
                      key={stage.stageName}
                      style={{
                        ...stageCardStyle,
                        borderColor: active ? tone.color : 'rgba(148, 163, 184, 0.18)',
                        boxShadow: active ? `0 10px 24px ${tone.shadow}` : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                          <span style={{ color: tone.color }}>{stageIconMap[stage.stageName] || <DeploymentUnitOutlined />}</span>
                          <span>{stage.stageName}</span>
                        </div>
                        <Tag color={tone.tagColor} style={{ marginInlineEnd: 0, paddingInline: 6, lineHeight: '16px', fontSize: 10 }}>
                          {tone.label}
                        </Tag>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: tone.color, marginBottom: 4, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {active ? `当前节点 · 总进度 ${progress}%` : tone.label}
                      </div>
                      <Progress
                        percent={Math.max(0, Math.min(100, stage.rate ?? 0))}
                        showInfo={false}
                        strokeColor={tone.color}
                        trailColor="rgba(148, 163, 184, 0.18)"
                      />
                      <div style={{ marginTop: 4, fontSize: 10, color: '#64748b', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {active ? `实际当前节点：${currentStage}` : tone.helper}
                      </div>
                    </div>
                  );
                }) : (
                  <div style={emptyPanelStyle}>暂未同步到节点数据</div>
                )}
              </div>
            </div>

            {data.remarks && (
              <div style={panelStyle}>
                <div style={panelTitleStyle}>订单备注</div>
                <div style={remarkCardStyle}>
                  <MessageOutlined style={{ color: '#3b82f6', fontSize: 16, marginTop: 2 }} />
                  <div style={remarkTextStyle}>{data.remarks}</div>
                </div>
              </div>
            )}
          </div>

          <div style={sideColumnStyle}>
            <div style={panelStyle}>
              <div style={panelTitleStyle}>客户查看重点</div>
              <div style={focusListStyle}>
                <FocusItem label="当前状态" value={data.statusText} />
                <FocusItem label="当前节点" value={currentStage} />
                <FocusItem label="预计完成" value={predictedDateText} />
                <FocusItem label="交付提醒" value={deliveryDiffText} />
              </div>
            </div>

            <div style={panelStyle}>
              <div style={panelTitleStyle}>最近进展</div>
              <div style={timelineStyle}>
                {recentScans.length > 0 ? recentScans.slice(0, 5).map((scan, index) => (
                  <div key={`${scan.processName || 'scan'}-${scan.scanTime || index}`} style={timelineItemStyle}>
                    <div style={timelineDotStyle} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{scan.processName || '生产更新'}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {scan.quantity != null ? `完成 ${scan.quantity} 件` : '有新的进展记录'}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{formatDateTime(scan.scanTime)}</div>
                    </div>
                  </div>
                )) : (
                  <div style={emptyPanelStyle}>暂无最新扫码动态</div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div style={bottomBrandLineStyle}>
          <span>2026云裳智链</span>
          <span>仅展示客户可见的生产进度信息</span>
          {expiresAtText !== '—' && <span>链接有效至 {expiresAtText}</span>}
        </div>
      </div>
    </div>
  );
};

interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlightColor?: string;
}

const MetricCard: React.FC<InfoItemProps> = ({ icon, label, value, highlightColor }) => (
  <div style={metricCardStyle}>
    <span style={{ color: highlightColor || '#3b82f6', marginRight: 6 }}>{icon}</span>
    <div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: highlightColor || '#0f172a' }}>{value}</div>
    </div>
  </div>
);

const AiItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={aiItemStyle}>
    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', lineHeight: 1.7 }}>{value}</div>
  </div>
);

const FocusItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={focusItemStyle}>
    <div style={{ fontSize: 12, color: '#94a3b8' }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', textAlign: 'right' }}>{value}</div>
  </div>
);

const XiaoyunMascotLink: React.FC<{ riskTone: { color: string; softColor: string } }> = ({ riskTone }) => (
  <a href={PLATFORM_URL} target="_blank" rel="noreferrer" style={xiaoYunLinkStyle} title="打开云裳智链平台">
    <div style={{ ...xiaoYunBubbleStyle, boxShadow: `0 0 0 6px ${riskTone.softColor}` }}>
      <CuteCloudTrigger size={60} active mood="curious" />
    </div>
  </a>
);

const getRiskTone = (riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH') => {
  if (riskLevel === 'HIGH') {
    return { label: '高风险预警', color: '#ef4444', softColor: 'rgba(239,68,68,0.12)' };
  }
  if (riskLevel === 'MEDIUM') {
    return { label: '中风险关注', color: '#f59e0b', softColor: 'rgba(245,158,11,0.12)' };
  }
  return { label: '低风险可控', color: '#10b981', softColor: 'rgba(16,185,129,0.12)' };
};

const getStageTone = (status: StageStatus) => {
  if (status === 'DONE') {
    return { color: '#10b981', tagColor: 'success', label: '已完成', helper: '该节点已完成' as const, shadow: 'rgba(16,185,129,0.16)' };
  }
  if (status === 'ACTIVE') {
    return { color: '#3b82f6', tagColor: 'processing', label: '进行中', helper: '该节点正在推进' as const, shadow: 'rgba(59,130,246,0.16)' };
  }
  return { color: '#94a3b8', tagColor: 'default', label: '待开始', helper: '该节点尚未开始' as const, shadow: 'rgba(148,163,184,0.12)' };
};

const isCurrentStage = (stageName: string, currentStage?: string, latestStage?: string) => {
  const current = String(currentStage || latestStage || '').trim();
  return !!current && (current.includes(stageName) || stageName.includes(current));
};

const formatDate = (value?: string | number | Date) => {
  if (value == null || value === '') return '—';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('zh-CN');
  } catch {
    return String(value);
  }
};

const formatDateTime = (value?: string | number | Date) => {
  if (value == null || value === '') return '—';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
};

const formatRemainingDays = (days?: number) => {
  if (days == null) return '待确认';
  if (days <= 0) return '临近完成';
  return `约 ${days} 天`;
};

const describeDelivery = (plannedEndDate?: string, predictedFinishDate?: string) => {
  if (!plannedEndDate && !predictedFinishDate) return '系统正在持续跟踪交付节奏';
  if (plannedEndDate && predictedFinishDate) {
    const planned = new Date(plannedEndDate);
    const predicted = new Date(predictedFinishDate);
    if (!Number.isNaN(planned.getTime()) && !Number.isNaN(predicted.getTime())) {
      const diffDays = Math.round((predicted.getTime() - planned.getTime()) / 86400000);
      if (diffDays > 0) return `预计较计划晚 ${diffDays} 天完成`;
      if (diffDays < 0) return `预计可比计划提前 ${Math.abs(diffDays)} 天完成`;
      return '预计可按计划完成';
    }
  }
  return '系统正在持续跟踪交付节奏';
};

const getDisplayColorSizeQuantities = (
  rawColor?: string,
  rawSize?: string,
  rawQuantity?: number,
  colorSizeQuantities?: Array<{ color?: string; size?: string; quantity?: number }>
) => {
  const normalized = Array.isArray(colorSizeQuantities)
    ? colorSizeQuantities
      .map((item) => ({
        color: String(item?.color || '').trim(),
        size: String(item?.size || '').trim().toUpperCase(),
        quantity: Number(item?.quantity ?? 0),
      }))
      .filter((item) => item.color && item.size && item.quantity > 0)
    : [];
  if (normalized.length > 0) {
    return normalized;
  }
  const fallbackColor = String(rawColor || '').trim();
  const fallbackSizes = String(rawSize || '')
    .split(/[,\s，/]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  const fallbackQuantity = Number(rawQuantity || 0);
  if (fallbackColor && fallbackSizes.length === 1 && fallbackQuantity > 0) {
    return [{ color: fallbackColor, size: fallbackSizes[0], quantity: fallbackQuantity }];
  }
  return [];
};

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'radial-gradient(circle at top left, rgba(59,130,246,0.16), transparent 26%), radial-gradient(circle at bottom right, rgba(16,185,129,0.14), transparent 24%), linear-gradient(180deg, #eef6ff 0%, #f8fbff 45%, #f3faf6 100%)',
  padding: '32px 16px 40px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const shellStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 1120,
  margin: '0 auto',
};

const heroCardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.88)',
  backdropFilter: 'blur(18px)',
  borderRadius: 28,
  padding: '28px 28px 24px',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.10)',
  border: '1px solid rgba(255,255,255,0.75)',
  marginBottom: 20,
};

const heroHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 14,
};

const brandTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#0f172a',
};

const brandSubtitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  marginTop: 2,
};

const statusTagStyle: React.CSSProperties = {
  marginInlineEnd: 0,
  padding: '6px 14px',
  borderRadius: 999,
  fontWeight: 700,
};

const orderNoStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  color: '#0f172a',
  marginBottom: 8,
};

const heroOverviewStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '108px minmax(0, 1fr)',
  gap: 16,
  alignItems: 'center',
  marginBottom: 14,
};

const heroGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 14,
  marginBottom: 14,
};

const styleCoverCardStyle: React.CSSProperties = {
  width: 108,
  height: 136,
  borderRadius: 18,
  overflow: 'hidden',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(241,245,249,0.9))',
  border: '1px solid rgba(148,163,184,0.16)',
  boxShadow: '0 10px 28px rgba(15,23,42,0.08)',
};

const styleCoverImageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

const styleCoverPlaceholderStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.88))',
};

const summaryPanelStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.82), rgba(241,245,249,0.76))',
  borderRadius: 20,
  padding: '18px 18px 16px',
  border: '1px solid rgba(148,163,184,0.18)',
};

const summaryCaptionStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#64748b',
  marginBottom: 8,
};

const currentStageStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  color: '#0f172a',
  marginBottom: 8,
};

const summaryTextStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#64748b',
  lineHeight: 1.7,
};

const sizeQtyFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  marginTop: 12,
  paddingTop: 10,
  borderTop: '1px solid rgba(226,232,240,0.9)',
  fontSize: 13,
  fontWeight: 600,
  color: '#334155',
};

const progressSummaryRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  marginBottom: 10,
  marginTop: 2,
  flexWrap: 'wrap',
};

const progressSummaryTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#2563eb',
};

const progressSummaryMetaStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#64748b',
};

const metricGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 12,
  marginTop: 18,
};

const metricCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  background: 'rgba(248,250,252,0.9)',
  borderRadius: 16,
  padding: '12px 14px',
  border: '1px solid rgba(148,163,184,0.14)',
};

const contentGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.7fr) minmax(300px, 0.95fr)',
  gap: 20,
  alignItems: 'start',
};

const mainColumnStyle: React.CSSProperties = {
  display: 'grid',
  gap: 20,
};

const sideColumnStyle: React.CSSProperties = {
  display: 'grid',
  gap: 20,
};

const panelStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.9)',
  backdropFilter: 'blur(16px)',
  borderRadius: 24,
  padding: '22px 22px 20px',
  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
  border: '1px solid rgba(255,255,255,0.78)',
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: '#0f172a',
  marginBottom: 16,
};

const aiHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 16,
  flexWrap: 'wrap',
};

const xiaoYunLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none',
  flexShrink: 0,
};

const xiaoYunBubbleStyle: React.CSSProperties = {
  width: 76,
  height: 76,
  borderRadius: 24,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(239,246,255,0.92))',
  border: '1px solid rgba(148,163,184,0.16)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 12px 24px rgba(37,99,235,0.12)',
};

const aiSupportTextStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  color: '#94a3b8',
  lineHeight: 1.5,
};

const confidenceStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#0f172a',
  background: 'rgba(241,245,249,0.9)',
  borderRadius: 999,
  padding: '8px 12px',
};

const aiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
};

const aiItemStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(248,250,252,0.92), rgba(241,245,249,0.84))',
  borderRadius: 18,
  padding: '14px 15px',
  border: '1px solid rgba(148,163,184,0.16)',
};

const stageGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 8,
};

const stageCardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.92)',
  borderRadius: 16,
  padding: '7px 9px 7px',
  border: '1px solid rgba(148,163,184,0.18)',
  minHeight: 58,
};

const remarkCardStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  padding: '16px 18px',
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(239,246,255,0.9), rgba(248,250,252,0.9))',
  border: '1px solid rgba(59,130,246,0.14)',
};

const remarkTextStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#0f172a',
  lineHeight: 1.8,
  whiteSpace: 'pre-wrap',
};

const focusListStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
};

const focusItemStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: '12px 14px',
  background: 'rgba(248,250,252,0.9)',
  borderRadius: 16,
  border: '1px solid rgba(148,163,184,0.14)',
};

const timelineStyle: React.CSSProperties = {
  display: 'grid',
  gap: 14,
};

const timelineItemStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '14px minmax(0, 1fr)',
  gap: 12,
  alignItems: 'start',
};

const timelineDotStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  background: '#2563eb',
  marginTop: 7,
  boxShadow: '0 0 0 4px rgba(59,130,246,0.14)',
};

const emptyPanelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#94a3b8',
  lineHeight: 1.7,
};

const bottomBrandLineStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  flexWrap: 'wrap',
  gap: 14,
  padding: '4px 6px 0',
  fontSize: 12,
  color: '#94a3b8',
};

export default ShareOrderPage;
