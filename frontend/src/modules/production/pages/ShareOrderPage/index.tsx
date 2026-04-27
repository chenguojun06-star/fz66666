import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Progress, Spin, Result as AntResult, Tag } from 'antd';
import {
  ClockCircleFilled, ClockCircleOutlined, CalendarOutlined, TeamOutlined,
  MessageOutlined, FieldTimeOutlined, DeploymentUnitOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import OrderInfoGrid from '@/components/common/OrderInfoGrid';
import { createOrderColorSizeMatrixInfoItems } from '@/components/common/OrderColorSizeMatrix';
import { type ShareOrderData, statusColorMap, stageIconMap } from './types';
import { getRiskTone, getStageTone, isCurrentStage, formatDate, formatDateTime, formatRemainingDays, describeDelivery, getDisplayColorSizeQuantities } from './utils';
import { MetricCard, AiItem, FocusItem, XiaoyunMascotLink } from './components';
import * as S from './styles';

const ShareOrderPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ShareOrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError('链接无效'); setLoading(false); return; }
    axios.get<{ code: number; data: ShareOrderData; message: string }>(`/api/public/share/order/${encodeURIComponent(token)}`)
      .then((res) => { const d = res.data; if (d?.code !== undefined && d.code !== 200) { setError(d.message || '分享链接已失效'); } else { setData((d?.data ?? d) as ShareOrderData); } })
      .catch(() => setError('网络错误，请稍后重试'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div style={S.pageStyle}><Spin size="large" spinning tip="加载中…"><div /></Spin></div>;
  if (error || !data) return <div style={S.pageStyle}><AntResult status="warning" title={error || '订单信息不存在'} subTitle="此分享链接可能已过期或不存在，请联系发送方重新分享" /></div>;

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
  const summaryText = progress >= 100 ? '订单已完成，可关注后续发货安排。' : aiPrediction?.riskLevel === 'HIGH' ? '当前存在较高交付风险，建议重点跟进关键节点。' : aiPrediction?.riskLevel === 'MEDIUM' ? '当前节奏可控，但交期较近，需要持续跟进。' : '当前生产节奏正常，系统将持续跟踪关键工序。';
  const progressBarSize: [string | number, number] = ['100%', 12];
  const colorSizeQuantities = getDisplayColorSizeQuantities(data.color, data.size, data.orderQuantity, data.colorSizeQuantities);
  const styleCoverUrl = token && data.styleCover ? `/api/public/share/order/${token}/style-cover` : '';
  const totalQuantityText = `${data.orderQuantity ?? 0} 件`;
  const completedSummaryText = `已完成 ${data.completedQuantity ?? 0} / ${data.orderQuantity ?? 0} 件`;
  const displayColorText = Array.from(new Set(colorSizeQuantities.map((item) => String(item.color || '').trim()).filter(Boolean))).join(' / ') || (String(data.color || '').trim() || '—');
  const infoLabelStyle: React.CSSProperties = { color: '#64748b', fontSize: 12 };
  const infoValueStyle: React.CSSProperties = { color: '#0f172a', fontSize: 13, fontWeight: 700 };
  const shareMatrixItems = createOrderColorSizeMatrixInfoItems({
    items: colorSizeQuantities.map((item) => ({ color: String(item.color || '').trim(), size: String(item.size || '').trim(), quantity: Number(item.quantity ?? 0) })),
    fallbackColor: displayColorText, fallbackSize: String(data.size || '').trim(), fallbackQuantity: data.orderQuantity ?? 0,
    totalLabel: '总数', totalSuffix: '件', columnMinWidth: 28, gap: 10, fontSize: 13, labelStyle: infoLabelStyle, valueStyle: infoValueStyle,
  });

  return (
    <div style={S.pageStyle}>
      <div style={S.shellStyle}>
        <div style={S.heroCardStyle}>
          <div style={S.heroHeaderStyle}>
            <div><div style={S.brandTitleStyle}>{data.companyName || '客户订单追踪'}</div><div style={S.brandSubtitleStyle}>客户订单工序跟进</div></div>
            <Tag color={statusColor} style={S.statusTagStyle}>{data.statusText}</Tag>
          </div>
          <div style={S.heroOverviewStyle}>
            <div style={S.styleCoverCardStyle}>
              {styleCoverUrl ? <img src={styleCoverUrl} alt={data.styleName || data.styleNo || data.orderNo} style={S.styleCoverImageStyle} /> : <div style={S.styleCoverPlaceholderStyle}><div style={{ fontSize: 12, color: '#94a3b8' }}>暂无款式图</div></div>}
            </div>
            <div>
              <div style={S.orderNoStyle}>{data.orderNo}</div>
              <OrderInfoGrid gap={10} rowGap={6} fontSize={13} items={[
                { label: '款号', value: data.styleNo || '—', labelStyle: infoLabelStyle, valueStyle: infoValueStyle },
                { label: '款名', value: data.styleName || '—', labelStyle: infoLabelStyle, valueStyle: infoValueStyle },
                { label: '工厂', value: data.factoryName || '待分配', labelStyle: infoLabelStyle, valueStyle: infoValueStyle },
                { label: '颜色', value: displayColorText, labelStyle: infoLabelStyle, valueStyle: infoValueStyle },
                { label: '下单数量', value: totalQuantityText, labelStyle: infoLabelStyle, valueStyle: infoValueStyle },
              ]} />
            </div>
          </div>
          <div style={S.heroGridStyle}>
            <div style={{ ...S.summaryPanelStyle, minHeight: 96 }}>
              <div style={S.summaryCaptionStyle}>当前节点</div>
              <div style={S.currentStageStyle}>{currentStage}</div>
              <div style={S.summaryTextStyle}>{summaryText}</div>
            </div>
            <div style={{ ...S.summaryPanelStyle, paddingBottom: 14, minHeight: 96 }}>
              <div style={S.summaryCaptionStyle}>尺码数量</div>
              <OrderInfoGrid gap={10} rowGap={6} fontSize={13} items={shareMatrixItems} />
              <div style={S.sizeQtyFooterStyle}><span>总数 {totalQuantityText}</span><span>{completedSummaryText}</span></div>
            </div>
          </div>
          <div style={S.progressSummaryRowStyle}>
            <div style={S.progressSummaryTitleStyle}>总进度 {progress}%</div>
            <div style={S.progressSummaryMetaStyle}>{completedSummaryText}</div>
          </div>
          <Progress percent={progress} strokeColor={{ '0%': '#3b82f6', '50%': '#10b981', '100%': '#22c55e' }} trailColor="rgba(148, 163, 184, 0.18)" size={progressBarSize} showInfo={false} />
          <div style={S.metricGridStyle}>
            <MetricCard icon={<CalendarOutlined />} label="计划交期" value={plannedDateText} />
            <MetricCard icon={<FieldTimeOutlined />} label="预计完成" value={predictedDateText} highlightColor={riskTone.color} />
            <MetricCard icon={<ClockCircleFilled />} label="预计还需" value={remainingDaysText} highlightColor={riskTone.color} />
            <MetricCard icon={<TeamOutlined />} label="生产工厂" value={data.factoryName || '待分配'} />
            <MetricCard icon={<CalendarOutlined />} label="下单日期" value={formatDate(data.createTime)} />
            <MetricCard icon={<ClockCircleOutlined />} label="最近更新" value={data.latestScanTime ? `${data.latestScanStage || '生产中'} · ${formatDateTime(data.latestScanTime)}` : '暂无更新'} />
          </div>
        </div>
        <div style={S.contentGridStyle}>
          <div style={S.mainColumnStyle}>
            <div style={S.panelStyle}>
              <div style={S.panelTitleStyle}>AI 智能进度卡</div>
              <div style={S.aiHeaderStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <XiaoyunMascotLink riskTone={riskTone} />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{riskTone.label}</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>{deliveryDiffText}</div>
                    <div style={S.aiSupportTextStyle}>数据由 云裳智链 · 实时智能化平台提供支持</div>
                  </div>
                </div>
                <div style={S.confidenceStyle}>{aiPrediction?.confidence ?? 0}% 置信度</div>
              </div>
              <div style={S.aiGridStyle}>
                <AiItem label="当前判断" value={aiPrediction?.riskReason || '系统正在持续分析订单进度。'} />
                <AiItem label="预计完成时间" value={`${predictedDateText} · ${remainingDaysText}`} />
              </div>
            </div>
            <div style={S.panelStyle}>
              <div style={S.panelTitleStyle}>节点进度</div>
              <div style={S.stageGridStyle}>
                {stages.length > 0 ? stages.map((stage) => {
                  const tone = getStageTone(stage.status);
                  const active = isCurrentStage(stage.stageName, currentStage, data.latestScanStage);
                  return (
                    <div key={stage.stageName} style={{ ...S.stageCardStyle, borderColor: active ? tone.color : 'rgba(148, 163, 184, 0.18)', boxShadow: active ? `0 10px 24px ${tone.shadow}` : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                          <span style={{ color: tone.color }}>{stageIconMap[stage.stageName] || <DeploymentUnitOutlined />}</span><span>{stage.stageName}</span>
                        </div>
                        <Tag color={tone.tagColor} style={{ marginInlineEnd: 0, paddingInline: 6, lineHeight: '16px', fontSize: 10 }}>{tone.label}</Tag>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: tone.color, marginBottom: 4, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{active ? `当前节点 · 总进度 ${progress}%` : tone.label}</div>
                      <Progress percent={Math.max(0, Math.min(100, stage.rate ?? 0))} showInfo={false} strokeColor={tone.color} trailColor="rgba(148, 163, 184, 0.18)" />
                      <div style={{ marginTop: 4, fontSize: 10, color: '#64748b', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{active ? `实际当前节点：${currentStage}` : tone.helper}</div>
                    </div>
                  );
                }) : <div style={S.emptyPanelStyle}>暂未同步到节点数据</div>}
              </div>
            </div>
            {data.remarks && (
              <div style={S.panelStyle}>
                <div style={S.panelTitleStyle}>订单备注</div>
                <div style={S.remarkCardStyle}><MessageOutlined style={{ color: '#3b82f6', fontSize: 16, marginTop: 2 }} /><div style={S.remarkTextStyle}>{data.remarks}</div></div>
              </div>
            )}
          </div>
          <div style={S.sideColumnStyle}>
            <div style={S.panelStyle}>
              <div style={S.panelTitleStyle}>客户查看重点</div>
              <div style={S.focusListStyle}>
                <FocusItem label="当前状态" value={data.statusText} />
                <FocusItem label="当前节点" value={currentStage} />
                <FocusItem label="预计完成" value={predictedDateText} />
                <FocusItem label="交付提醒" value={deliveryDiffText} />
              </div>
            </div>
            <div style={S.panelStyle}>
              <div style={S.panelTitleStyle}>最近进展</div>
              <div style={S.timelineStyle}>
                {recentScans.length > 0 ? recentScans.slice(0, 5).map((scan, index) => (
                  <div key={`${scan.processName || 'scan'}-${scan.scanTime || index}`} style={S.timelineItemStyle}>
                    <div style={S.timelineDotStyle} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{scan.processName || '生产更新'}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{scan.quantity != null ? `完成 ${scan.quantity} 件` : '有新的进展记录'}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{formatDateTime(scan.scanTime)}</div>
                    </div>
                  </div>
                )) : <div style={S.emptyPanelStyle}>暂无最新扫码动态</div>}
              </div>
            </div>
          </div>
        </div>
        <div style={S.bottomBrandLineStyle}>
          <span>2026云裳智链</span>
          <span>仅展示客户可见的工序跟进信息</span>
          {expiresAtText !== '—' && <span>链接有效至 {expiresAtText}</span>}
        </div>
      </div>
    </div>
  );
};

export default ShareOrderPage;
